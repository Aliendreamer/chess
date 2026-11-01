# The JNI glue calls these by name from the bridge's threads (mobile-app D6).
-keep class expo.modules.stockfish.StockfishModule {
  void onLines(java.lang.String[]);
  void onExit(java.lang.String);
  native <methods>;
}
