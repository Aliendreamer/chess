## Why

Projection dead letters (`event-publishing`) can only be seen and replayed with curl: an admin must know the routes,
paste a session cookie and read raw JSON while a game's read model is quarantined. The owner asked on 2026-10-02 for
screens for what exists only as an API; this is the one operators need.

## What Changes

For an admin (realm role `Admin`):

- An **Admin** entry in the navigation, shown only to admins, opening `/admin`.
- `/admin` lists parked records newest first, filterable by projection, each with its aggregate, sequence number,
  attempts, when it was parked and its last error (expandable), page by page.
- A **Replay** button per record replays that aggregate's parked records for that projection and shows the outcome
  (replayed n, or the new error); the list refreshes.
- Anyone else gets the not-found page at `/admin`, and the API keeps answering 403.

In the code: BFF server functions over the existing `GET /api/admin/projections/dead-letters` and
`POST /api/admin/projections/{group}/dead-letters/{aggregate}/replay`, a role check in the route's `beforeLoad`, and
`components/admin.tsx`. No backend change.

Part: cross-cutting operations (`event-publishing`). Out of scope: Kafka offsets, publisher lag, health or user
administration screens (Grafana covers the first three), bulk replay.

## Capabilities

### New Capabilities

- `admin-screens`: the admin-only navigation entry and the dead-letter page (list, filter, replay).

### Modified Capabilities

(none)

## Impact

- Frontend only: `lib/admin.ts` (types, the projection group list, `isAdmin`), `lib/server/admin.ts`, `api.ts`
  (`getDeadLetters`, `postReplayDeadLetters`), `components/admin.tsx`, `routes/_authenticated/admin.tsx`,
  `components/layout.tsx` (navigation gets `me`).
- Relies on `testuser` holding `Admin` in the local realm (it does) for the e2e spec.
