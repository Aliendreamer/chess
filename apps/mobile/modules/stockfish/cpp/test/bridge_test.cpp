// The bridge on the host (mobile-app D6, D13; run by tools/mobile/bridge-test.sh): the real Stockfish behind swapped
// streams, the batcher's coalescing, the request marker and the crash record.
#include <sys/wait.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "../bridge.h"

namespace {

int failures = 0;
#define CHECK(cond, what)                                                       \
    do {                                                                        \
        if (!(cond)) {                                                          \
            std::fprintf(stderr, "FAIL %s:%d %s\n", __FILE__, __LINE__, what);  \
            ++failures;                                                         \
        }                                                                       \
    } while (0)

struct Collector {
    std::mutex                            m;
    std::condition_variable               cv;
    std::vector<std::vector<std::string>> batches;
    std::atomic<int>                      exits{0};
    std::string                           exitReason;

    void add(std::vector<std::string> batch) {
        std::lock_guard<std::mutex> lock(m);
        batches.push_back(std::move(batch));
        cv.notify_all();
    }
    bool seen(const std::string& prefix) {
        for (auto& b : batches)
            for (auto& l : b)
                if (l.rfind(prefix, 0) == 0) return true;
        return false;
    }
    bool waitFor(const std::string& prefix, int ms = 20000) {
        std::unique_lock<std::mutex> lock(m);
        return cv.wait_for(lock, std::chrono::milliseconds(ms), [&] { return seen(prefix); });
    }
};

bool exists(const std::string& path) { return std::ifstream(path).good(); }
std::string slurp(const std::string& path) {
    std::ifstream in(path);
    std::stringstream s;
    s << in.rdbuf();
    return s.str();
}

std::string tempDir() {
    char tmpl[] = "/tmp/sfbridge-XXXXXX";
    return mkdtemp(tmpl);
}

sfbridge::Callbacks callbacks(Collector& c) {
    return {[&c](std::vector<std::string> lines) { c.add(std::move(lines)); },
            [&c](const std::string& reason) {
                c.exitReason = reason;
                c.exits++;
                c.cv.notify_all();
            }};
}

void searchesAndCoalesces() {
    Collector c;
    auto      dir = tempDir();
    CHECK(sfbridge::start(callbacks(c), dir), "start");
    CHECK(!sfbridge::start(callbacks(c), dir), "a second start is refused");
    sfbridge::send("uci");
    CHECK(c.waitFor("uciok"), "uciok");
    sfbridge::send("setoption name MultiPV value 3");
    sfbridge::send("isready");
    CHECK(c.waitFor("readyok"), "readyok");
    sfbridge::send("# request {\"kind\":\"board\",\"fen\":\"startpos\"}");
    sfbridge::send("position startpos");
    sfbridge::send("go depth 16");
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    CHECK(exists(dir + "/engine-request.json"), "the marker is written for the search");
    CHECK(slurp(dir + "/engine-request.json") == "{\"kind\":\"board\",\"fen\":\"startpos\"}", "the marker holds the request");
    CHECK(c.waitFor("bestmove"), "bestmove");
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    CHECK(!exists(dir + "/engine-request.json"), "the marker is removed on bestmove");

    std::lock_guard<std::mutex> lock(c.m);
    int infos = 0;
    for (auto& batch : c.batches) {
        std::map<std::string, int> perPv;
        for (std::size_t i = 0; i < batch.size(); ++i) {
            auto& l = batch[i];
            CHECK(l.find("Unknown command") == std::string::npos, "comments never reach Stockfish");
            if (l.rfind("bestmove", 0) == 0) CHECK(i + 1 == batch.size(), "bestmove ends its batch");
            auto at = l.find(" multipv ");
            if (l.rfind("info", 0) == 0 && at != std::string::npos) {
                infos++;
                auto pv = l.substr(at + 9, l.find(' ', at + 9) - (at + 9));
                CHECK(++perPv[pv] == 1, "at most one info line per multipv in a batch");
            }
        }
    }
    CHECK(infos >= 3, "the lines' latest states arrive");
    c.m.unlock();
    sfbridge::quit();
    c.m.lock();
    CHECK(c.exits == 1 && c.exitReason == "quit", "quit ends the engine");
}

void restarts() {
    Collector c;
    CHECK(sfbridge::start(callbacks(c), tempDir()), "a fresh engine after quit");
    sfbridge::send("uci");
    CHECK(c.waitFor("uciok"), "uciok again");
    sfbridge::send("position startpos moves e2e4");
    sfbridge::send("go depth 6");
    CHECK(c.waitFor("bestmove"), "bestmove again");
    sfbridge::quit();
}

/** Runs `body` in a child process and returns how it ended. */
template <typename F> int inChild(F body) {
    pid_t pid = fork();
    if (pid == 0) {
        body();
        _exit(0);
    }
    int status = 0;
    waitpid(pid, &status, 0);
    return status;
}

void recordsACrashOnTheEngineThread() {
    auto dir    = tempDir();
    int  status = inChild([&] {
        Collector c;
        sfbridge::start(callbacks(c), dir);
        sfbridge::send("uci");
        c.waitFor("uciok");
        sfbridge::send("# request {\"kind\":\"review\",\"fen\":\"8/8/8/8/8/8/8/K6k w - - 0 1\"}");
        sfbridge::send("# crash-test");
        std::this_thread::sleep_for(std::chrono::seconds(5));
    });
    CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGSEGV, "the process dies of the engine's SIGSEGV");
    auto crash = slurp(dir + "/engine-crash.json");
    CHECK(crash.find("\"signal\":\"SIGSEGV\"") != std::string::npos, "the crash record names the signal");
    CHECK(crash.find("8/8/8/8/8/8/8/K6k") != std::string::npos, "the crash record holds the request");
    CHECK(crash.find("\"atMs\":") != std::string::npos, "the crash record has its time");
}

void blamesNothingOnStockfishForAnotherThread() {
    auto dir    = tempDir();
    int  status = inChild([&] {
        Collector c;
        sfbridge::start(callbacks(c), dir);
        sfbridge::send("uci");
        c.waitFor("uciok");
        std::raise(SIGSEGV);
    });
    CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGSEGV, "the process still dies of its own SIGSEGV");
    CHECK(!exists(dir + "/engine-crash.json"), "no crash record for another thread");
}

}  // namespace

int main() {
    searchesAndCoalesces();
    restarts();
    recordsACrashOnTheEngineThread();
    blamesNothingOnStockfishForAnotherThread();
    if (failures) {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    std::puts("bridge: all checks passed");
    return 0;
}
