## Why

The app is narrowing to a club's place to play and study. Seven-day correspondence games, their move deadlines and
their e-mails add a second game mode, a projection, a sweeper job, a mail pipeline and a local mail server that the club
does not need now.

## What Changes

- **BREAKING** The `7d` time control is gone everywhere: invites accept presets only, and nothing reads `7d` back.
  Existing `7d` games are deleted from the read side by the `RemoveCorrespondence` migration (their journal events stay
  unused).
- **BREAKING** `GET /api/me/games` loses `turn=mine`, `yourTurn` and `deadlineAt`; home loses "Your turn".
- The move-deadline logic leaves `GameActor`; `DeadlineProjection`, `game_deadlines`, `NotificationConsumer`,
  `notification_games`, `IMailer`/MailKit and the `Correspondence:*` and `Smtp:*` settings are removed.
- The sweeper keeps its other job only: waking quiet untimed games so an engine game nobody is at still ends.
- Frontend: the "7 days" invite chip, "Your turn", the deadline line on the game page, the correspondence colour token
  and `e2e/correspondence.spec.ts` go. Local stack: Mailpit, its Traefik route and `verify-part3.sh` go.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `correspondence-games`: every requirement removed.
- `game-history`: the own-games list without `turn=mine`.
- `engine-play`: quiet engine games are woken by the idle sweep, with no correspondence deadlines ahead of them.
- `site-themes`: no correspondence category colour, no "Your turn" rows.

## Impact

- Backend: `Games/TimeControl.cs`, `Akka/Games/GameActor.cs` and messages, the sweeper (moved out of
  `Correspondence/`), `WebApi/Games/MyGames/`, invites, `Extensions/`, `Config/appsettings*.json`, a migration, tests.
- Frontend: `lib/{games,play,admin}.ts`, `lib/server/{api,play}.ts`, `components/games.tsx`, `styles.css`, home and the
  game page, tests.
- Local stack: `tools/localdev/docker-compose.yml`, `traefik/dynamic.yml`, `stack.sh`, `verify-part3.sh` (deleted).
