## Why

The owner wants opening theory in the club (2026-10-03) and chose, of the options researched, an explorer of the famous
games (built: `library-explorer`) and a trainer: "1 of course" — learn the **named openings**, a **whole family** at a
time ("2 is ok"), with the club **remembering each member's progress** ("2 of course"). The named lines are already in
the backend (lichess `chess-openings`, CC0); nothing lets a member practise them.

## What Changes

For a member:

- A **Trainer** page lists the opening families (a family is a name prefix: "Sicilian Defense", or narrower
  "Sicilian Defense: Najdorf Variation"), searchable, each with its number of lines and the member's progress.
- A **drill**: the member picks a family and a colour; the board plays the other side's moves of the line that is due,
  the member plays theirs. A wrong move is shown with the right one and must be corrected to go on; the line counts as
  missed. A line played through without a mistake counts as known.
- **Progress is remembered** per member, family line and colour (a Leitner box 0–5 with a due time): missed and new
  lines come first, known lines come back after 1, 3, 7 and 14 days. The family page shows "23 of 41 lines learned"
  and each line's state; the member's profile lists the openings trained.

In the code: the `openings` table keeps each line's moves; a `trainer_progress` table; `WebApi/Trainer/` (families,
a family's tree with progress, the next due line, a result); frontend `lib/trainer.ts`, `components/trainer.tsx`,
`/trainer`, `/trainer/$family`.

Part: 6 (analysis, library). Out of scope: a member's own repertoire, lines beyond the named list, engine replies off
the book, timed drills, sharing progress with other members.

## Capabilities

### New Capabilities

- `opening-trainer`: opening families from the named lines, drills on the board, the per-member schedule and progress.

### Modified Capabilities

(none — `game-library` keeps its requirements; the openings table only gains a column)

## Impact

- Backend: migration (`openings."MovesUci"`, `trainer_progress`); `Library/Openings.cs` seed fills the moves (re-seeds
  once when they are missing); new `Trainer/` (families, scheduling — pure) and `WebApi/Trainer/` endpoints.
- Frontend: `lib/trainer.ts` (tree walk, move checking), `lib/server/trainer.ts`, `components/trainer.tsx`, two
  routes, navigation, a profile section.
- Data: CC0 opening list only; progress is the member's own and is never shown to others.
