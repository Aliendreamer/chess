## 1. Backend

- [x] 1.1 Remove the four invite endpoints and the invite-only actor commands; keep rematch and journal recovery
- [x] 1.2 Tests: rematch facts in `InviteActorTests`, the integration rematch test starts its game with `IGameStarter`

## 2. Frontend

- [x] 2.1 Remove "Play a friend", `/invites/$id` and the invite server functions; Recent games shows 12
- [x] 2.2 e2e two-player setup through quick pairing (`pairedGame`)

## 3. Scripts and docs

- [x] 3.1 `verify-part1.sh` and `verify-part4a.sh` pair through the queue
- [x] 3.2 CLAUDE.md
- [ ] 3.3 Integration tests, e2e and the verify scripts on the stack (Docker: run by the user)
