## Why

The opening trainer drills only the named lines of the lichess list. The owner (2026-10-05) wants a member's own
repertoire too: "studies is fine to be an option" — a member who has written their lines into a study should be able to
drill them the same way, with the club remembering what they know.

## What Changes

For a member:

- The **Trainer** page gets a second option next to the named openings: **My studies**. It lists the member's own
  studies, each with its number of lines and how many they have learned from the chosen side.
- A **study drill** works like an opening drill: the member picks one of their studies and a colour; the board plays the
  other side's moves of the line that is due, the member plays theirs; a wrong move is shown with the right one and must
  be replaced; the line counts as missed.
- **Every line of the study is drilled**: each path from the study's start to the end of a line (the main line and every
  variation) is one line. Where the study has several replies for the other side, each reply is its own line, so the
  board varies its answers the way the study does.
- **Progress is remembered** per member, line and colour on the trainer's Leitner schedule (box 0–5, missed lines first,
  learned from box 3). Editing a study keeps the progress of every line whose moves did not change; a changed, extended
  or new line starts as new; a removed line's progress is dropped. Deleting the study drops its progress.
- Studies that start from a position other than the standard one are drilled from that position.

In the code: `trainer_progress` gains a nullable `StudyId`; `Trainer/StudyLines` (pure) turns a study tree into lines;
`TrainerService` gains the study variants of families/family/next/results; `WebApi/Trainer/` gains study endpoints;
frontend `lib/trainer.ts` drills from any start position, `/trainer` gets the option, `/trainer/study/$id` the drill.

Part: 6 (analysis, library), a follow-up to `opening-trainer`. It settles the "Later: the member's own repertoire (lines
from their studies)" note in ROADMAP Part 6.

Out of scope: drilling studies shared with the member by others, drilling a finished game's moves directly (Save as
study first), the study's comments or arrows, mixing a study with the named lines in one drill, showing study progress
on the profile (it stays on the trainer page), choosing a sub-tree of a study.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `opening-trainer`: a member's own studies become a second source of lines, drilled and scheduled the same way.

## Impact

- Backend: migration (`trainer_progress."StudyId"` uuid null, FK to `studies` on delete cascade, index (UserId,
  StudyId, Color)); `Trainer/StudyLines.cs`; `TrainerService` study methods; `StudyService.UpdateAsync` prunes the
  owner's progress rows for lines that no longer exist; four endpoints under `WebApi/Trainer/`.
- Frontend: `lib/trainer.ts` (`TrainerLine.startFen`, side to move and move numbers from it), `lib/server/trainer.ts`,
  `components/trainer.tsx` (study list), `/trainer` (the option), new `/trainer/study/$id`.
- Data: only the member's own studies and progress; nothing new is shown to others.
