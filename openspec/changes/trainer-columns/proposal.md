## Why

The opening trainer listed about 150 families alphabetically in one list some 6,500px tall, each with an empty
"0 of N learned" bar: hard to scan and mostly noise.

## What Changes

- The families are shown in columns by kind — gambits, defences, openings and attacks, games and others — read from
  the family's name, side by side; each column scrolls on its own and the page fits the screen (`wide fill`).
- In each column the families with lines learned come first, then by name; a row shows "N lines", or "3/36 learned"
  once something is learned. The search filters inside the columns and an empty column is hidden.
- My studies uses the same compact rows in a scrolling list. Drill pages keep their progress bar.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `opening-trainer`: families are offered grouped by kind.

## Impact

Frontend only: `lib/trainer.ts` (`openingKind`, `groupFamilies`), `components/trainer.tsx` (`FamilyColumns`,
`LearnedCount`), `routes/_authenticated/trainer.index.tsx`, their tests.
