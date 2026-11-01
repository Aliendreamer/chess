import { describe, expectTypeOf, it } from 'vitest'
import type {
  AnalysisView,
  ChessEvent,
  LibraryGameView,
  LibraryPosition,
  NewsItem,
  ReviewView,
  StudyView,
  TrainerLine,
  TrainingItem,
  TrainingVerdict,
} from './index.ts'

// The shapes the local data layer returns and the screens take (mobile-app D1) live here, so code with no React — the
// data layer — can name them without depending on `@chess/ui`.
describe('view shapes', () => {
  it('are exported by @chess/core', () => {
    expectTypeOf<ReviewView['status']>().toEqualTypeOf<'none' | 'running' | 'complete'>()
    expectTypeOf<AnalysisView>().not.toBeAny()
    expectTypeOf<LibraryGameView['moves']>().toEqualTypeOf<Array<string>>()
    expectTypeOf<LibraryPosition['games']>().toEqualTypeOf<number>()
    expectTypeOf<NewsItem['url']>().toEqualTypeOf<string>()
    expectTypeOf<ChessEvent['ongoing']>().toEqualTypeOf<boolean>()
    expectTypeOf<StudyView>().not.toBeAny()
    expectTypeOf<TrainerLine>().not.toBeAny()
    expectTypeOf<TrainingItem>().not.toBeAny()
    expectTypeOf<TrainingVerdict>().not.toBeAny()
  })
})
