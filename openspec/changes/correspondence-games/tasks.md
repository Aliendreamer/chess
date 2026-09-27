Each group ends in one commit passing its gate. 🐳 = live stack.

## 1. Owner review

- [x] 1.1 The owner confirms the proposal's decisions 1–5 and the design. Nothing is built before this.

## 2. Backend

- [x] 2.1 `7d` time control, invites accept it, the queue does not; `GameActor` deadline rules, `CheckDeadline`, no
      presence claims, idle passivation; `Correspondence` settings. Tests. Commit `feat(backend): correspondence games`.
- [x] 2.2 `DeadlineProjection` + `game_deadlines` (migration) + `DeadlineSweeper` singleton. Tests. Commit
      `feat(backend): correspondence deadlines from the database`.
- [x] 2.3 `IMailer` (MailKit / log), `NotificationConsumer` + `notification_positions` (migration), `Smtp` settings.
      Tests. Commit `feat(backend): email notifications for correspondence games`.
- [x] 2.4 `GET /api/me/games?turn=mine` with `yourTurn`/`deadlineAt`, derived from `rm_games` (no migration). Tests. Commit
      `feat(backend): your turn list`.
- [ ] 2.5 🐳 Integration tests: a forfeit by deadline with a short deadline, a double check ends once, a move after
      passivation, mail sent once to a fake SMTP (MailKit to a local test server or `LogMailer` recorder).

## 3. Stack and frontend

- [x] 3.1 🐳 `mailpit` service and route, backend SMTP env. Commit `feat(repo): mailpit for local mail`.
- [x] 3.2 Invite `7 days`, "Your turn" on home, correspondence status on the game page. Tests. Commit
      `feat(frontend): correspondence games`.

## 4. Verify and docs

- [ ] 4.1 🐳 `verify-part3.sh` (invite at 7d, moves, the mail in Mailpit's API, deadline row, passivation and wake-up)
      and a Playwright spec. Commit `test(repo): verify part 3 on the live stack`.
- [ ] 4.2 CLAUDE.md, architecture, ROADMAP; archive. Commit `docs(repo): correspondence games`.
