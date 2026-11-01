// The Stockfish bridge (mobile-app D6, D13); see bridge.h. Stockfish's sources are compiled unmodified: this file
// does what its main() does, on a thread, with the streams swapped.
#include "bridge.h"

#include <fcntl.h>
#include <pthread.h>
#include <unistd.h>

#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <deque>
#include <iostream>
#include <memory>
#include <mutex>
#include <streambuf>
#include <thread>

#include "attacks.h"
#include "misc.h"
#include "position.h"
#include "tune.h"
#include "uci.h"

namespace sfbridge {
namespace {

constexpr auto FLUSH_EVERY = std::chrono::milliseconds(50);

// ---- The batcher: every 50 ms, the last `info` line per multipv; anything else flushes at once, in order. ----

class Batcher {
   public:
    explicit Batcher(std::function<void(std::vector<std::string>)> sink) : sink(std::move(sink)) {
        worker = std::thread([this] { run(); });
    }
    ~Batcher() {
        {
            std::lock_guard<std::mutex> lock(m);
            done = true;
        }
        cv.notify_all();
        worker.join();
        flush();
    }

    void add(std::string line) {
        std::vector<std::string> ready;
        {
            std::lock_guard<std::mutex> lock(m);
            auto pv = multipv(line);
            if (!pv.empty()) {
                for (auto& slot : batch)
                    if (multipv(slot) == pv) {
                        slot = std::move(line);
                        return;
                    }
                batch.push_back(std::move(line));
                return;
            }
            bool info = line.rfind("info", 0) == 0;
            batch.push_back(std::move(line));
            if (info) return;
            ready.swap(batch);
        }
        sink(std::move(ready));
    }

   private:
    /** The `multipv k` of an info line with a score, or "" for any other line. */
    static std::string multipv(const std::string& line) {
        if (line.rfind("info", 0) != 0) return "";
        auto at = line.find(" multipv ");
        if (at == std::string::npos || line.find(" pv ") == std::string::npos) return "";
        auto start = at + 9;
        return line.substr(start, line.find(' ', start) - start);
    }

    void run() {
        std::unique_lock<std::mutex> lock(m);
        while (!done) {
            cv.wait_for(lock, FLUSH_EVERY);
            if (batch.empty()) continue;
            std::vector<std::string> ready;
            ready.swap(batch);
            lock.unlock();
            sink(std::move(ready));
            lock.lock();
        }
    }

    void flush() {
        std::vector<std::string> ready;
        {
            std::lock_guard<std::mutex> lock(m);
            ready.swap(batch);
        }
        if (!ready.empty()) sink(std::move(ready));
    }

    std::function<void(std::vector<std::string>)> sink;
    std::mutex                                    m;
    std::condition_variable                       cv;
    std::vector<std::string>                      batch;
    bool                                          done = false;
    std::thread                                   worker;
};

// ---- The crash record: written by the signal handler, only for a fault on the engine thread. ----

char             crashPath[1024];
char             requestJson[2048] = "null";
pthread_t        engineThread;
volatile bool    engineRunning = false;
struct sigaction previous[32];
const int        SIGNALS[] = {SIGSEGV, SIGABRT, SIGILL, SIGBUS, SIGFPE};

const char* signalName(int sig) {
    switch (sig)
    {
    case SIGSEGV : return "SIGSEGV";
    case SIGABRT : return "SIGABRT";
    case SIGILL : return "SIGILL";
    case SIGBUS : return "SIGBUS";
    case SIGFPE : return "SIGFPE";
    default : return "SIGNAL";
    }
}

// Async-signal-safe only: write(2), open(2), clock_gettime(2), no allocation, no locks.
void writeAll(int fd, const char* text) { (void) !write(fd, text, std::strlen(text)); }

void writeNumber(int fd, long long n) {
    char buf[24];
    int  i = sizeof(buf);
    buf[--i] = '\0';
    do
        buf[--i] = static_cast<char>('0' + n % 10);
    while ((n /= 10) > 0 && i > 0);
    writeAll(fd, buf + i);
}

void onSignal(int sig, siginfo_t* info, void* context) {
    if (engineRunning && pthread_equal(pthread_self(), engineThread))
    {
        int fd = open(crashPath, O_WRONLY | O_CREAT | O_TRUNC, 0600);
        if (fd >= 0)
        {
            timespec now{};
            clock_gettime(CLOCK_REALTIME, &now);
            writeAll(fd, "{\"signal\":\"");
            writeAll(fd, signalName(sig));
            writeAll(fd, "\",\"atMs\":");
            writeNumber(fd, static_cast<long long>(now.tv_sec) * 1000 + now.tv_nsec / 1000000);
            writeAll(fd, ",\"request\":");
            writeAll(fd, requestJson);
            writeAll(fd, "}");
            close(fd);
        }
    }
    // Hand the signal on, so the system (and any crash reporter) sees the crash as it would without us.
    sigaction(sig, &previous[sig], nullptr);
    if (previous[sig].sa_flags & SA_SIGINFO && previous[sig].sa_sigaction)
        previous[sig].sa_sigaction(sig, info, context);
    else if (previous[sig].sa_handler != SIG_DFL && previous[sig].sa_handler != SIG_IGN)
        previous[sig].sa_handler(sig);
    else
        raise(sig);
}

void installHandlers() {
    static std::once_flag once;
    std::call_once(once, [] {
        for (int sig : SIGNALS)
        {
            struct sigaction action {};
            action.sa_sigaction = onSignal;
            action.sa_flags     = SA_SIGINFO | SA_ONSTACK;
            sigemptyset(&action.sa_mask);
            sigaction(sig, &action, &previous[sig]);
        }
    });
}

// ---- The streams. ----

/** std::cin for Stockfish: blocks until a line is queued. */
class LineInput: public std::streambuf {
   public:
    void push(std::string line) {
        {
            std::lock_guard<std::mutex> lock(m);
            lines.push_back(std::move(line));
        }
        cv.notify_one();
    }

   protected:
    int_type underflow() override {
        if (gptr() < egptr()) return traits_type::to_int_type(*gptr());
        std::unique_lock<std::mutex> lock(m);
        for (;;)
        {
            cv.wait(lock, [this] { return !lines.empty(); });
            current = std::move(lines.front()) + "\n";
            lines.pop_front();
#ifdef SFBRIDGE_CRASH_TEST
            // On the engine thread, as a real fault in Stockfish would be.
            if (current == "# crash-test\n") raise(SIGSEGV);
#endif
            if (current.rfind("# ", 0) != 0) break;
        }
        setg(current.data(), current.data(), current.data() + current.size());
        return traits_type::to_int_type(*gptr());
    }

   private:
    std::mutex              m;
    std::condition_variable cv;
    std::deque<std::string> lines;
    std::string             current;
};

/** std::cout for Stockfish: cut at '\n' into the batcher; `bestmove` removes the request marker. */
class LineOutput: public std::streambuf {
   public:
    LineOutput(Batcher& batcher, std::string markerPath) :
        batcher(batcher),
        markerPath(std::move(markerPath)) {}

   protected:
    int_type overflow(int_type c) override {
        if (c == traits_type::eof()) return traits_type::not_eof(c);
        put(static_cast<char>(c));
        return c;
    }
    std::streamsize xsputn(const char* s, std::streamsize n) override {
        for (std::streamsize i = 0; i < n; ++i)
            put(s[i]);
        return n;
    }

   private:
    void put(char c) {
        std::lock_guard<std::mutex> lock(m);
        if (c != '\n')
        {
            line += c;
            return;
        }
        if (line.rfind("bestmove", 0) == 0) std::remove(markerPath.c_str());
        batcher.add(std::move(line));
        line.clear();
    }

    Batcher&    batcher;
    std::string markerPath;
    std::mutex  m;
    std::string line;
};

struct Running {
    std::unique_ptr<Batcher>    batcher;
    std::unique_ptr<LineInput>  input;
    std::unique_ptr<LineOutput> output;
    std::thread                 thread;
    std::string                 markerPath;
    std::function<void(const std::string&)> onExit;
};

std::mutex               lifecycle;
std::unique_ptr<Running> running;

void writeMarker(const std::string& path, const std::string& json) {
    if (FILE* f = std::fopen(path.c_str(), "w"))
    {
        std::fputs(json.c_str(), f);
        std::fclose(f);
    }
}

}  // namespace

bool start(Callbacks callbacks, const std::string& filesDir) {
    std::lock_guard<std::mutex> lock(lifecycle);
    if (running) return false;
    static std::once_flag tables;
    std::call_once(tables, [] {
        Stockfish::Attacks::init();
        Stockfish::Position::init();
    });
    std::snprintf(crashPath, sizeof(crashPath), "%s/engine-crash.json", filesDir.c_str());
    std::snprintf(requestJson, sizeof(requestJson), "null");
    installHandlers();

    auto r        = std::make_unique<Running>();
    r->markerPath = filesDir + "/engine-request.json";
    r->batcher    = std::make_unique<Batcher>(callbacks.onLines);
    r->input      = std::make_unique<LineInput>();
    r->output     = std::make_unique<LineOutput>(*r->batcher, r->markerPath);
    std::cin.rdbuf(r->input.get());
    std::cout.rdbuf(r->output.get());
    r->onExit   = callbacks.onExit;
    r->thread   = std::thread([] {
        engineThread  = pthread_self();
        engineRunning = true;
        {
            char  name[] = "stockfish";
            char* argv[] = {name, nullptr};
            auto  uci    = std::make_unique<Stockfish::UCIEngine>(Stockfish::CommandLine(1, argv));
            Stockfish::Tune::init(uci->engine_options());
            uci->loop();
        }
        engineRunning = false;
    });
    running = std::move(r);
    return true;
}

void send(const std::string& line) {
    std::lock_guard<std::mutex> lock(lifecycle);
    if (!running) return;
    if (line.rfind("# request ", 0) == 0)
    {
        // Kept for the next `go` and for the crash record; never passed to Stockfish.
        std::snprintf(requestJson, sizeof(requestJson), "%s", line.c_str() + 10);
        return;
    }
    if (line.rfind("go", 0) == 0 && std::strcmp(requestJson, "null") != 0)
        writeMarker(running->markerPath, requestJson);
    running->input->push(line);
}

void quit() {
    std::unique_ptr<Running> r;
    {
        std::lock_guard<std::mutex> lock(lifecycle);
        if (!running) return;
        running->input->push("quit");
        r = std::move(running);
    }
    r->thread.join();
    r->batcher.reset();  // flushes what is left, so the exit comes after the last line
    std::cout.rdbuf(nullptr);
    std::cin.rdbuf(nullptr);
    r->onExit("quit");
}

}  // namespace sfbridge
