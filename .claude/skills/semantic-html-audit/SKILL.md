---
name: semantic-html-audit
description:
  'Audit components for non-semantic interactive HTML. Flags div/span used as buttons, missing type="button", and
  enforces native <button> for all clickable elements. Checks Chromium 70 CSS compatibility for button resets. Use after
  a change session as a quality gate.'
type: skill
disable-model-invocation: false
user-invocable: true
tags: [react-dev, quality, html, accessibility, chromium]
agents: [claude, codex, cursor, gemini, copilot]
version: 0.1.0
author: Aliendreamer
---

# Semantic HTML Audit

Audit components for semantic HTML violations — specifically non-interactive elements used as buttons — and ensure any
button-reset CSS is compatible with **Chromium 70** (the app's minimum target).

**Input**: File path, directory, or glob pattern. If omitted, infer from recent git changes
(`git diff --name-only HEAD`).

---

## The Rule

Every interactive element that can be clicked or activated via `Enter`/`Space` MUST be a native
`<button type="button">`.

Using `<div>`, `<span>`, or any other non-interactive element with `role="button"` or `onClick` is **banned**.

**Why native `<button>`?**

- Built-in keyboard activation (`Enter` and `Space`) — no `onKeyDown` needed
- Correct implicit ARIA role (`button`) — no manual `role="button"` needed
- Natively focusable — no extra `tabIndex={0}` needed (keep `tabIndex={-1}` only when Norigin manages focus)
- Screen readers on Tizen/LG webOS announce it correctly without extra ARIA wiring

---

## Chromium 70 HTML/CSS Compatibility

These constraints apply to all semantic HTML and button-reset CSS written for this project.

### Safe to use (Chromium 70+)

| Feature                                                    | Notes                                       |
| ---------------------------------------------------------- | ------------------------------------------- |
| `<button type="button">`                                   | Fully supported                             |
| `<button type="submit">`                                   | For real form submissions only              |
| `role="switch"` on `<button>`                              | ARIA 1.1 — supported in Chrome 66+          |
| `aria-checked`, `aria-disabled`, `aria-label`, `aria-live` | Standard ARIA — all supported               |
| `-webkit-appearance: none`                                 | Required prefix for Chromium 70             |
| `border: none` / `border: 0`                               | Supported                                   |
| `background: transparent`                                  | Supported                                   |
| `font: inherit`                                            | Supported                                   |
| `:focus` pseudo-class                                      | Supported — use instead of `:focus-visible` |

### NOT supported in Chromium 70 — flag as violation

| Feature                            | First supported | Action                                                                                  |
| ---------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `appearance: none` (unprefixed)    | Chrome 84       | Replace with `-webkit-appearance: none` **or** add `-webkit-appearance: none` before it |
| `:focus-visible`                   | Chrome 86       | Replace with `:focus`                                                                   |
| `<dialog>` `.requestClose()`       | Chrome 122      | Do not use — no polyfill; use state-driven show/hide                                    |
| CSS `gap` on flexbox               | Chrome 84       | Use `margin` between items instead                                                      |
| `clamp()`, `min()`, `max()` in CSS | Chrome 79       | Use fixed values or calc() instead                                                      |
| `aspect-ratio` property            | Chrome 88       | Use padding-top % trick or fixed dimensions                                             |

> **The global button reset in `src/app/globals.css` already applies `-webkit-appearance: none` and `appearance: none`
> (both) to all `<button>` elements.** Component CSS classes override as needed. Do NOT add per-element Tailwind reset
> classes unless a specific CSS class overrides the global reset.

---

## Steps

1. **Resolve the target**

   If no path provided, run:

   ```bash
   git diff --name-only HEAD
   ```

   Filter to `.tsx`, `.ts`, and `.css` files in `src/components/`, `src/app/`, and `src/lib/`.

2. **Scan for violations**

   For each `.tsx` / `.ts` file, check for:

   ### A. Non-button elements with `role="button"`

   ```bash
   grep -n 'role="button"' <file>
   ```

   Flag any `<div role="button">`, `<span role="button">`, `<li role="button">`, etc.

   ### B. Non-button elements with `onClick`

   ```bash
   grep -n 'onClick' <file>
   ```

   For each hit, check if the element is a `<button>`, `<a>`, or other natively interactive element. Flag
   `<div onClick>`, `<span onClick>`, `<li onClick>`, etc.

   ### C. `<button>` without `type="button"`

   ```bash
   grep -n '<button' <file>
   ```

   Flag any `<button>` missing `type="button"` (or `type="submit"` where submit is intentional). Default type is
   `submit` — always be explicit.

   ### D. `tabIndex={0}` on converted elements

   After conversion from `<div>` to `<button>`, `tabIndex={0}` is redundant (button is natively focusable). Flag
   `tabIndex={0}` on `<button>` elements — remove it, or use `tabIndex={-1}` only if Norigin manages focus.

   For each `.css` file, also check for:

   ### E. `appearance: none` without `-webkit-appearance: none` (Chromium 70 violation)

   ```bash
   grep -n 'appearance: none' <file>
   ```

   Flag any occurrence of `appearance: none` that is NOT preceded by `-webkit-appearance: none` on the line immediately
   above. The unprefixed `appearance` property is **not supported** in Chromium 70 (added in Chrome 84).

   ### F. `:focus-visible` usage (Chromium 70 violation)

   ```bash
   grep -n ':focus-visible' <file>
   ```

   Flag any usage — replace with `:focus`.

3. **Report findings**

   ```text
   ## Semantic HTML Audit: <path>

   ### Summary
   Files checked: N
   Violations: N (X critical, Y warnings)

   ### Critical Violations (must fix)
   - [file:line] `<div role="button">` — replace with `<button type="button">`
   - [file:line] `<span onClick={...}>` — replace with `<button type="button">`
   - [file:line] `appearance: none` without `-webkit-appearance: none` — add prefixed version above it

   ### Warnings
   - [file:line] `<button>` missing `type="button"` — add explicit type

   ### Clean
   - No violations found in: <files>
   ```

4. **Offer to fix**

   After the report, if there are violations:

   > "Want me to fix the violations?"

   If yes: apply the fixes per the patterns below.

---

## Fix Patterns

### JSX: `<div role="button">` → `<button type="button">`

```tsx
// BEFORE (violation)
<div
  ref={ref}
  role="button"
  tabIndex={-1}
  onClick={handleClick}
  className="my-class"
>
  Content
</div>

// AFTER (correct)
// No extra reset classes needed — global button reset in globals.css covers all defaults.
<button
  type="button"
  ref={ref}
  tabIndex={-1}
  onClick={handleClick}
  className="my-class"
>
  Content
</button>
```

### JSX: `<div role="switch">` → `<button type="button" role="switch">`

```tsx
// BEFORE (violation)
<div
  ref={ref}
  role="switch"
  aria-checked={isOn}
  tabIndex={-1}
  onClick={handleToggle}
  className="my-toggle"
>
  ...
</div>

// AFTER (correct)
// role="switch" is kept — it is NOT implicit on <button>. aria-checked is required.
<button
  type="button"
  ref={ref}
  role="switch"
  aria-checked={isOn}
  tabIndex={-1}
  onClick={handleToggle}
  className="my-toggle"
>
  ...
</button>
```

### CSS: `appearance: none` without prefix

```css
/* BEFORE (violation — Chromium 70 ignores unprefixed appearance) */
.my-button {
  appearance: none;
}

/* AFTER (correct — both lines required for Chromium 70 + modern browsers) */
.my-button {
  -webkit-appearance: none;
  appearance: none;
}
```

Key rules for fixes:

- Always add `type="button"` on `<button>` (default is `type="submit"` — always be explicit)
- Remove `role="button"` (it is implicit on `<button>`)
- **Keep** `role="switch"` — it is NOT implicit; pair with `aria-checked`
- Keep `tabIndex={-1}` if Norigin spatial nav manages focus for this element
- Remove `tabIndex={0}` — redundant on native `<button>` (natively focusable)
- Do NOT add Tailwind reset classes to `<button>` — the global reset in `globals.css` already handles `border`,
  `background`, `padding`, `font`, `-webkit-appearance`

---

## Guardrails

- Do NOT change focus management logic, Norigin wiring, or `onPointerEnter`/`focusSelf` calls
- Do NOT change styling beyond what is listed in the fix patterns
- Do NOT add `type="submit"` — all action buttons use `type="button"` unless they are inside an actual `<form>` and
  intentionally submit it
- Flag `<a href="#">` used as button — these should also become `<button type="button">`
- Do NOT auto-fix `<a>` elements with real `href` — those are legitimate links
- Do NOT use `:focus-visible` — use `:focus` instead (Chromium 70 constraint)
