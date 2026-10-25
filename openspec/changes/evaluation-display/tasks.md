Each step test first; the gates are the libraries' and apps' `lint test`, `dotnet build` + the backend tests, and the
named e2e specs against the live stack.

## 1. Libraries

- [x] 1.1 `@chess/ui` `EvalBar`, `EngineLines`, `EvaluationTicks`; `AnalysisBoard`'s optional `shown`/`onShown`;
      `useAnalysis(request, initialThink)`, `useAutoEvaluate(…, enabled)`. Tests: the bar's share and turn, the lines in
      SAN, the board without ticks unchanged, nothing asked with both off.
- [x] 1.2 `@chess/core` `Preferences` gains the four switches, `isPreferences` accepts a set without them,
      `withDefaults` completes one.

## 2. Backend

- [x] 2.1 `Preferences` record with the switches and their defaults; `PutPreferencesRequest` nullable switches. Tests:
      defaults, saved and read back, a request without them keeps the defaults; an old row reads with them.

## 3. Desktop

- [x] 3.1 Game page: ticks under the board, bar, best moves, the second-Stockfish note; analysis page: ticks on the
      board; both from the preferences. Tests: off by default in a game, on in analysis, remembered.

## 4. Club

- [x] 4.1 `/analysis` ticks; `/games/$id` ticks, bar and best moves for the engine game's player only; saved through
      `PUT /api/me/preferences`. e2e: `analysis-board` (ticked by default), `engine` (tick, see, untick), `play` (none
      in a game between people). **[human/🐳]** the specs pass against the stack.
