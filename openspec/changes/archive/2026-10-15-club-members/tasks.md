## 1. Backend: presence and members

- [x] 1.1 Migration: `users."Active"` (default true), `users."LastSeenAt"`; `PlayerIdentity` stays public-only
- [x] 1.2 `Akka/Presence/PresenceActor` singleton: leases, playing from `GameActor` start/end, `GetPresence`,
      `TryReserveChallenge`/release, `members` and `user:` frames; `LastSeenAt` on going offline; tests
- [x] 1.3 `LiveRelay` routes `user:` presence; `ILiveTopicSource` for `user` (open challenges) and `members`
- [x] 1.4 `GET /api/members`

## 2. Backend: challenges

- [x] 2.1 `InviteCreated.Lifetime`/`Kind` (optional), the expiry timer, `Decline`, `Cancel` by the creator; tests
- [x] 2.2 `POST /api/challenges`, `…/{id}/accept|decline|cancel` with the D2 refusals
- [x] 2.3 Integration test: challenge → accept → game; decline; expiry

## 3. Backend: member admin

- [x] 3.1 `Authentication/KeycloakAdmin.cs` (`IKeycloakAdmin`), options in `appsettings.json`
- [x] 3.2 `ISessionStore.RevokeAllAsync`; inactive users answered 401 by the provisioning pre-processor
- [x] 3.3 `WebApi/Admin/Members/*` with the self-protection rules; unit tests on the logic
- [x] 3.4 Integration test against the stack's Keycloak (create, sign in, deactivate): the suite has no Keycloak
      container, so `verify-members.sh` (5.2) proves it on the live stack; unit tests run member admin against a fake
      `IKeycloakAdmin` and the client against a fake HTTP handler

## 4. Frontend

- [x] 4.1 `lib/members.ts`, `lib/server/members.ts`, `api.ts` entries, relay `KINDS` (`user` own id only, `members`)
- [x] 4.2 Shell: `user:` topic and `ChallengeBanner`
- [x] 4.3 `/members` with Challenge and the waiting state; the rail's Members
- [x] 4.4 `/admin` Members tab: create, one-time password, actions
- [x] 4.5 Profile games: Analyse on finished games; the review panel for any finished game
- [x] 4.6 e2e: challenge accepted between the two test users; admin creates and deactivates a member

## 5. Docs

- [x] 5.1 CLAUDE.md notes
- [x] 5.2 Verify script `verify-members.sh` against the stack's Keycloak (create, first sign-in with a new
      password, self-protection, offline challenge refused, deactivate → 401 and sign-in refused, reactivate, reset)
