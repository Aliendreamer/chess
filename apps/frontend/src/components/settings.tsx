import type { Animation, Preferences } from '#/lib/auth'
import type { BoardTheme } from '#/lib/board'
import { ANIMATIONS, PreferencesContext, SITE_THEMES } from '#/lib/auth'
import { BOARD_THEMES } from '#/lib/board'
import { Board } from '#/components/games'
import { Chip, ErrorText, Panel } from '#/components/ui'

const THEME_NAMES: Record<BoardTheme, string> = {
  brown: 'Brown',
  blue: 'Blue',
  green: 'Green',
  slate: 'Slate',
  walnut: 'Club walnut',
}

const ANIMATION_NAMES: Record<Animation, string> = { off: 'Off', fast: 'Fast', normal: 'Normal' }

const SITE_NAMES: Record<(typeof SITE_THEMES)[number], string> = {
  dark: 'Dark (Club)',
  light: 'Light (Parchment)',
}

/** A position with a capture, a check and both colours, so every highlight and theme shows in the preview. */
const PREVIEW_FEN = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'

export interface SettingsFormProps {
  prefs: Preferences
  error: string | null
  onChange: (next: Preferences) => void
}

/** The settings page (user-preferences): every choice applies at once, with a preview board in the chosen theme. */
export function SettingsForm({ prefs, error, onChange }: SettingsFormProps) {
  const set = <TKey extends keyof Preferences>(key: TKey, value: Preferences[TKey]) =>
    onChange({ ...prefs, [key]: value })
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-8">
      <div className="flex flex-col gap-5">
        <Panel title="Board" className="gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Board theme">
            {BOARD_THEMES.map((theme) => (
              <span key={theme} data-board={theme} className="contents">
                <Chip
                  selected={prefs.boardTheme === theme}
                  onClick={() => set('boardTheme', theme)}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="grid size-4 grid-cols-2 overflow-hidden rounded-sm"
                    >
                      <span className="bg-board-light" />
                      <span className="bg-board-dark" />
                      <span className="bg-board-dark" />
                      <span className="bg-board-light" />
                    </span>
                    {THEME_NAMES[theme]}
                  </span>
                </Chip>
              </span>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-fg-body">
            <input
              id="settings-coordinates"
              type="checkbox"
              checked={prefs.coordinates}
              onChange={(e) => set('coordinates', e.target.checked)}
            />
            Coordinates
          </label>
        </Panel>
        <Panel title="Piece animation" className="gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Piece animation">
            {ANIMATIONS.map((a) => (
              <Chip key={a} selected={prefs.animation === a} onClick={() => set('animation', a)}>
                {ANIMATION_NAMES[a]}
              </Chip>
            ))}
          </div>
        </Panel>
        <Panel title="Site theme" className="gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Site theme">
            {SITE_THEMES.map((t) => (
              <Chip key={t} selected={prefs.siteTheme === t} onClick={() => set('siteTheme', t)}>
                {SITE_NAMES[t]}
              </Chip>
            ))}
          </div>
        </Panel>
        {error ? <ErrorText testId="settings-error">{error}</ErrorText> : null}
      </div>
      <div data-board={prefs.boardTheme} data-testid="settings-preview" className="max-w-[420px]">
        <PreferencesContext value={prefs}>
          <Board fen={PREVIEW_FEN} orientation="white" lastMove={{ from: 'h5', to: 'f7' }} />
        </PreferencesContext>
      </div>
    </div>
  )
}
