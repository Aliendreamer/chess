# Game library sources

The planned imports for the famous-games library (`game-library`). The PGN files are **never committed**: an admin
fetches them and imports them on `/admin` → Game library, naming the source and licence shown below. Only moves and
factual headers are stored; annotations are dropped. Checked 2026-10-02 — not legal advice.

| Import                                                                | Where                                                                                                   | Licence to enter                    | World Championship | Status                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------ | --------------------------------------------------- |
| World Championship matches 1886–1990                                  | [PGN Mentor](https://www.pgnmentor.com/files.html) → Events → World Championship (one `.pgn` per match) | `moves only (facts)`                | yes                | waiting for the owner's check of PGN Mentor's terms |
| World Championship matches 2000–2024 (Kasparov–Kramnik … Gukesh–Ding) | PGN Mentor, as above                                                                                    | `moves only (facts)`                | yes                | waiting for the owner's check                       |
| World Championships 1993–2004 (split title, FIDE knockouts)           | not on PGN Mentor; candidate: Caissabase (said to be CC0)                                               | `CC0` once verified                 | yes                | waiting for the owner's Caissabase check            |
| Title matches 2021–2026 (incl. Gukesh–Sindarov, Geneva, Nov–Dec 2026) | [lichess broadcasts](https://database.lichess.org/#broadcasts) or the broadcast's round PGN             | `CC BY-SA 4.0 (lichess broadcasts)` | yes                | allowed; attribute "lichess broadcasts"             |
| Candidates tournaments 1950–2024                                      | PGN Mentor → Events → Candidates                                                                        | `moves only (facts)`                | no                 | waiting for the owner's check                       |
| Classics (Immortal, Evergreen, Opera Game, …)                         | hand-picked, moves typed from public-domain game records                                                | `moves only (facts)`                | no                 | to curate                                           |

Never import: The Week in Chess archives (personal use only), chessgames.com and ChessBase databases (proprietary;
EU/UK database right), lichess's masters explorer (no stated licence, OAuth only).

A source found unsuitable later is removed with one statement: `delete from library_games where source = '…'` (its
positions go with it).
