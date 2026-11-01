// The JNI side of the Stockfish module (mobile-app D6): forwards StockfishModule's calls to the bridge and the
// bridge's callbacks (on its own threads) to StockfishModule.onLines / onExit.
#include <jni.h>

#include <mutex>
#include <string>
#include <vector>

#include "bridge.h"

namespace {

JavaVM*   vm         = nullptr;
jobject   module     = nullptr;  // global ref to the StockfishModule that started the engine
jclass    stringType = nullptr;  // global ref
jmethodID onLinesId  = nullptr;
jmethodID onExitId   = nullptr;
std::mutex moduleLock;

/** The calling thread's JNIEnv; a bridge thread is attached once and detached when it ends. */
JNIEnv* env() {
    struct Attached {
        JNIEnv* env      = nullptr;
        bool    attached = false;
        ~Attached() {
            if (attached) vm->DetachCurrentThread();
        }
    };
    thread_local Attached t;
    if (!t.env && vm->GetEnv(reinterpret_cast<void**>(&t.env), JNI_VERSION_1_6) != JNI_OK)
    {
        vm->AttachCurrentThread(&t.env, nullptr);
        t.attached = true;
    }
    return t.env;
}

void deliverLines(std::vector<std::string> lines) {
    JNIEnv* e = env();
    std::lock_guard<std::mutex> lock(moduleLock);
    if (!module) return;
    // A frame per batch: a native thread's local refs are freed only by popping them.
    if (e->PushLocalFrame(static_cast<jint>(lines.size()) + 4) != 0) return;
    jobjectArray array = e->NewObjectArray(static_cast<jsize>(lines.size()), stringType, nullptr);
    for (jsize i = 0; i < static_cast<jsize>(lines.size()); ++i)
        e->SetObjectArrayElement(array, i, e->NewStringUTF(lines[i].c_str()));
    e->CallVoidMethod(module, onLinesId, array);
    if (e->ExceptionCheck()) e->ExceptionClear();
    e->PopLocalFrame(nullptr);
}

void deliverExit(const std::string& reason) {
    JNIEnv* e = env();
    std::lock_guard<std::mutex> lock(moduleLock);
    if (!module) return;
    jstring text = e->NewStringUTF(reason.c_str());
    e->CallVoidMethod(module, onExitId, text);
    if (e->ExceptionCheck()) e->ExceptionClear();
    e->DeleteLocalRef(text);
}

std::string utf8(JNIEnv* e, jstring s) {
    const char* chars = e->GetStringUTFChars(s, nullptr);
    std::string out(chars ? chars : "");
    if (chars) e->ReleaseStringUTFChars(s, chars);
    return out;
}

}  // namespace

extern "C" JNIEXPORT jint JNI_OnLoad(JavaVM* javaVm, void*) {
    vm = javaVm;
    return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_stockfish_StockfishModule_nativeStart(JNIEnv* e, jobject self, jstring filesDir) {
    {
        std::lock_guard<std::mutex> lock(moduleLock);
        // The newest module instance gets the events (a development reload makes a new one).
        if (module) e->DeleteGlobalRef(module);
        module = e->NewGlobalRef(self);
        if (!stringType) stringType = static_cast<jclass>(e->NewGlobalRef(e->FindClass("java/lang/String")));
        jclass type = e->GetObjectClass(self);
        onLinesId   = e->GetMethodID(type, "onLines", "([Ljava/lang/String;)V");
        onExitId    = e->GetMethodID(type, "onExit", "(Ljava/lang/String;)V");
        e->DeleteLocalRef(type);
    }
    return sfbridge::start({deliverLines, deliverExit}, utf8(e, filesDir)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL Java_expo_modules_stockfish_StockfishModule_nativeSend(JNIEnv* e, jobject, jstring line) {
    sfbridge::send(utf8(e, line));
}

extern "C" JNIEXPORT void JNICALL Java_expo_modules_stockfish_StockfishModule_nativeQuit(JNIEnv*, jobject) {
    sfbridge::quit();
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_expo_modules_stockfish_StockfishModule_nativeTakeFiles(JNIEnv* e, jobject, jstring filesDir) {
    auto         left  = sfbridge::takeFiles(utf8(e, filesDir));
    jobjectArray array = e->NewObjectArray(2, e->FindClass("java/lang/String"), nullptr);
    if (!left.crash.empty()) e->SetObjectArrayElement(array, 0, e->NewStringUTF(left.crash.c_str()));
    if (!left.marker.empty()) e->SetObjectArrayElement(array, 1, e->NewStringUTF(left.marker.c_str()));
    return array;
}
