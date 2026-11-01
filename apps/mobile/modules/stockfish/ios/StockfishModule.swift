import ExpoModulesCore

/**
 * Stockfish 19 inside the app (mobile-app D6), as on Android: a line carrier. `quit` waits on a thread of its own,
 * never Expo's module queue, so an engine that does not end cannot hold up other modules (D13).
 */
public class StockfishModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Stockfish")

    Events("lines", "exit")

    AsyncFunction("start") { () -> Bool in
      SFBridge.start(
        withFilesDir: Self.filesDir(),
        onLines: { [weak self] lines in self?.sendEvent("lines", ["lines": lines]) },
        onExit: { [weak self] reason in self?.sendEvent("exit", ["reason": reason]) }
      )
    }

    Function("send") { (line: String) in
      SFBridge.send(line)
    }

    AsyncFunction("quit") { (promise: Promise) in
      Thread {
        SFBridge.quit()
        promise.resolve(nil)
      }.start()
    }

    Function("takeCrashFiles") { () -> [String: Any] in
      SFBridge.takeFiles(withFilesDir: Self.filesDir())
    }
  }

  /** The app's documents directory, where the bridge keeps the request marker and the crash record. */
  static func filesDir() -> String {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].path
  }
}
