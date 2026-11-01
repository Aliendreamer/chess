// Presentational React shared by the club frontend and the desktop app (shared-chess-libraries): the board and game
// pieces, the primitives, and per feature its components (`<feature>.tsx`). The hooks and helpers they use are
// `@chess/view`'s, re-exported here so the apps keep one import.
export * from './board.tsx'
export * from './game.tsx'
export * from './library.tsx'
export * from './news.tsx'
export * from './review.tsx'
export * from './settings.tsx'
export * from './studies.tsx'
export * from './trainer.tsx'
export * from './training.tsx'
export * from './ui.tsx'
export * from '@chess/view'
// The DOM's keys and visibility for the hooks that take them; these names win over `@chess/view`'s.
export { useMoveTree, useReview } from './dom.ts'
