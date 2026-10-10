## 1. Backend

- [x] 1.1 Remove `7d` from `TimeControl`, invites and every reader; remove the move-deadline logic from `GameActor`
- [x] 1.2 Remove `DeadlineProjection`, `game_deadlines`, `NotificationConsumer`, `notification_games`, `IMailer`, MailKit and their settings
- [x] 1.3 Keep the quiet-untimed-game wake as its own sweeper singleton with its own setting
- [x] 1.4 `GET /api/me/games` without `turn=mine`, `yourTurn`, `deadlineAt`
- [x] 1.5 Migration `RemoveCorrespondence`: drop the two tables, delete read-side rows of `7d` games
- [x] 1.6 Tests updated; idle-sweep query tests kept

## 2. Frontend

- [x] 2.1 Remove the "7 days" chip, "Your turn", the deadline line, `CORRESPONDENCE`, `timeLeft`, `YourTurnList`, the correspondence category and token
- [x] 2.2 Remove `turn=mine` from the server functions; drop the two consumer groups from `lib/admin.ts`
- [x] 2.3 Delete `e2e/correspondence.spec.ts`; update unit tests

## 3. Local stack and docs

- [x] 3.1 Remove Mailpit (compose, Traefik, `stack.sh`) and `verify-part3.sh`
- [x] 3.2 CLAUDE.md
- [ ] 3.3 Backend integration tests and Playwright (need Docker: run by the user)
