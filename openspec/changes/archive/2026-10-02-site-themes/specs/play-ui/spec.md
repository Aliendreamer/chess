## MODIFIED Requirements

### Requirement: The UI uses the Club design tokens only

Colours, fonts, radii and spacing SHALL come from the Club tokens defined in `styles.css` (CSS variables mapped
into Tailwind's `@theme`), including the game-type tokens (`--color-tc-*`). A site theme MAY redefine the semantic
tokens under `[data-theme=…]`, and components SHALL use only the semantic names. Fonts MUST be self-hosted, and the
page MUST NOT load fonts or styles from a third party.

#### Scenario: No third-party font request

- **WHEN** any page is loaded
- **THEN** every font and stylesheet is served from `app.`'s own origin

#### Scenario: A theme changes no component

- **WHEN** the light theme is added
- **THEN** no file under `components/` changes for it, only `styles.css`
