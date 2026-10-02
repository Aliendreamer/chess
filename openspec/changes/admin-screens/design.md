## Context

The admin API exists and is role-checked (`Roles(Admin)`): the list reads the primary, keyset by `(ParkedAt, Id)`,
optional exact `groupId`; replay answers 200 with `{status: replayed, applied}`, 409 with the same body when the record
fails again, 404 for an unknown group. `GET /api/me` already returns `roles`, which the BFF puts into router context;
nothing in the frontend reads roles yet.

## Goals / Non-Goals

**Goals:** see and replay dead letters from the browser, without exposing the page to non-admins.

**Non-Goals:** new backend endpoints; any other operational screen.

## Decisions

1. **The API stays the guard; the UI only hides.** The route's `beforeLoad` throws `notFound()` unless `me.roles`
   includes `Admin`, and the nav entry is shown only to admins — but a non-admin calling the server function still
   gets the API's 403, surfaced as an error. Not-found rather than "forbidden" keeps the page's existence quiet.
2. **The group list lives in `lib/admin.ts`.** The seven projection group ids (`chess.rm-games` …) are mirrored as a
   constant for the filter chips; the server function validates `groupId` against it, and the aggregate id against
   `^[A-Za-z0-9:._-]{1,128}$`, before any call reaches the API.
3. **Replay outcome inline.** The replay command returns the API body for 200 and 409 alike (the 409 is an outcome,
   not an exception), so the row shows "Replayed 3" or "Failed again: …" and the list is reloaded.
4. **Errors are long.** `lastError` is shown as its first line, with the full text in a `<details>` (works without JS).

## Risks / Trade-offs

- [The group list drifts from `IProjection` group ids] → a new projection's dead letters still show under "All"; the
  chip is missing until added. Noted in CLAUDE.md next to the projection list.
