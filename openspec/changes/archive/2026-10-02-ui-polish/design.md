## Context

TanStack Router supports `head()` per route (merged with the root's `title: 'Chess'`) and router-wide default
pending, error and not-found components. Only the game route sets a title today. Route files are excluded from
coverage, so anything with logic goes into `components/` or `lib/`.

## Goals / Non-Goals

**Goals:** every page names itself; no raw framework screens; list loading and failure are visible; the specific
defects found in the audit are fixed.

**Non-Goals:** new features, filters needing the API, restyling pages.

## Decisions

1. **`pageTitle(...parts)` in `lib/feedback.ts`.** One helper joins `parts` with " · " and appends "Chess", so every
   route's `head` and the your-move signal (which already rewrites `document.title`) agree. The your-move prefix keeps
   working because it decorates whatever title the route set.
2. **Router defaults from `components/layout.tsx`.** `PendingBar` (a 2 px accent bar, after `defaultPendingMs` 300 ms,
   `motion-safe` animation), `RouteError` (Panel with the message, "Try again" → `router.invalidate()`, and a Home
   link) and `NotFound` (Panel, Home link). They render inside the Shell because `_authenticated` wraps its outlet.
3. **`useLoadMore` in `lib/`.** History and Studies both page with a cursor; one hook owns `items`, `nextCursor`,
   `busy` and `error`, and a fetch failure becomes an error line instead of an unhandled rejection.
4. **Unknown addresses go through the signed-in layout.** A path no route matches is answered by the root, outside the
   Shell; `_authenticated/$.tsx` (a splat whose loader throws `notFound()`) catches it first, so the not-found page
   keeps the navigation. Found by `e2e/shell.spec.ts`.
5. **Nav matching.** `NavItem` takes `exact`; Home and History stay exact (a game page is not History — it may come
   from Watch), every other section highlights on its sub-pages.
6. **OptionTile figures scale.** The engine tiles' `figure` uses a smaller display size when the text is long
   (`figureSize: 'sm'`), instead of letting it overflow.

## Risks / Trade-offs

- [Title text depends on loader data] → titles use only loader data already fetched, never a second request.
