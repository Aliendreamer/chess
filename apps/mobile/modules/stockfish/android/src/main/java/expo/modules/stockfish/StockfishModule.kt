package expo.modules.stockfish

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Stockfish 19 inside the app (mobile-app D6): a line carrier. `send` queues a UCI line; the bridge's batches come back
 * as `lines` events, its end as `exit`. `quit` waits on a thread of its own, never Expo's module queue, so an engine
 * that does not end cannot hold up other modules (D13).
 */
class StockfishModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Stockfish")

    Events("lines", "exit")

    AsyncFunction("start") {
      nativeStart(filesDir())
    }

    Function("send") { line: String ->
      nativeSend(line)
    }

    AsyncFunction("quit") { promise: Promise ->
      Thread({
        nativeQuit()
        promise.resolve(null)
      }, "stockfish-quit").start()
    }

    Function("takeCrashFiles") {
      val files = nativeTakeFiles(filesDir())
      mapOf("crash" to files[0], "marker" to files[1])
    }
  }

  private fun filesDir(): String =
    (appContext.reactContext ?: throw Exceptions.ReactContextLost()).filesDir.absolutePath

  /** Called by the JNI glue on the bridge's batching thread. */
  @Suppress("unused")
  fun onLines(lines: Array<String>) {
    sendEvent("lines", mapOf("lines" to lines.toList()))
  }

  /** Called by the JNI glue once the engine thread has ended. */
  @Suppress("unused")
  fun onExit(reason: String) {
    sendEvent("exit", mapOf("reason" to reason))
  }

  private external fun nativeStart(filesDir: String): Boolean
  private external fun nativeSend(line: String)
  private external fun nativeQuit()
  private external fun nativeTakeFiles(filesDir: String): Array<String?>

  companion object {
    init {
      System.loadLibrary("stockfishbridge")
    }
  }
}
