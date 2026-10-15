## Why

The app is a chess club, not a public site: members are invited by an admin, see who else is in the club and online,
challenge each other to a game, and study each other's finished games. Today there is no list of members, no way to
play a particular member (invite links are gone, quick pairing is anonymous), and accounts can only be made in
Keycloak's console.

## What Changes

- **Online presence for members**: every open page keeps a live `user:{id}` topic; a member is online while one tab is
  open and playing while in a live game.
- **Members page** (`/members`): every active member, online first, with their state and a Challenge button.
- **Challenges**: a member challenges an online member who is not playing to a preset game type and a colour; the
  challenged member sees it on any page with a 60-second countdown and accepts or declines; the challenger may cancel.
  No mail, no links. A challenge is an invite reserved for one member (the rematch invite with its own game type and a
  60 s lifetime).
- **Member admin** (`/admin`, Members tab, Admin role): create a member (a temporary password shown once, changed at
  first sign-in), deactivate (Keycloak user disabled, sessions revoked, challenges and queue places dropped), reactivate,
  reset the password, grant or remove Admin. No self-deactivation, no deleting.
- **Studying club games**: the profile and members pages list a member's finished games with Analyse; the game page of
  any finished game shows its review to every member (reads were already open; auto-review covers every game).

## Capabilities

### New Capabilities

- `club-members`: presence and the members page.
- `challenges`: challenging a member to a game.
- `member-admin`: creating and deactivating members.

### Modified Capabilities

- `player-profiles`: a member's games open on the analysis board.

## Impact

Backend: `Akka/Presence/` (a `presence` cluster singleton), `Akka/Matchmaking/InviteActor` (challenge lifetime and
decline), `WebApi/Members/`, `WebApi/Challenges/`, `WebApi/Admin/Members/`, `Authentication/KeycloakAdmin.cs` (the
`chess_api` service account's admin API client), `ISessionStore.RevokeAllAsync`, a migration (`users."Active"`,
`users."LastSeenAt"`), live kinds `user` and `members`. Frontend: the Shell's `user:` topic and challenge banner,
`/members`, the admin Members tab, profile games with Analyse, `lib/members.ts`, `lib/server/members.ts`. The rail gets
Members.
