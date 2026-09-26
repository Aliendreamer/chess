using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Projections;

public sealed class GameProjectionTests
{
    private const string StartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    private static readonly DateTimeOffset T0 = Time.Utc("2026-09-26T10:00:00Z");
    private static readonly Guid Game = Guid.Parse("0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f");

    private static string Env<T>(string type, long seq, T payload, DateTimeOffset at) =>
        EventJson.Serialize(new EventEnvelope<T>(type, 1, Game.ToString("N"), seq, at, payload));

    private static string Created(long white = 1, long black = 2) =>
        Env("game.created", 1, new GameCreated(white, black, "5+3", 300_000, 3_000, T0), T0);

    private static string Move(long seq, int ply, string uci, string san, string fen) =>
        Env("game.move-made", seq, new MoveMade(ply, uci, san, fen, 300_000, 300_000, T0.AddSeconds(seq)), T0.AddSeconds(seq));

    private static readonly string[] FoolsMate =
    [
        Move(2, 1, "f2f3", "f3", "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1"),
        Move(3, 2, "e7e5", "e5", "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2"),
        Move(4, 3, "g2g4", "g4", "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2"),
        Move(5, 4, "d8h4", "Qh4#", "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"),
    ];

    private static (ProjectDbContext Db, GameProjection Projection) Build()
    {
        ProjectDbContext db = TestDb.Create();
        db.Users.AddRange(new User { Id = 1, Sub = "s1", Username = "testuser" }, new User { Id = 2, Sub = "s2", Username = "player" });
        db.SaveChanges();
        return (db, new GameProjection(db, NullLogger<GameProjection>.Instance));
    }

    private static async Task ApplyAll(GameProjection p, params string[] events)
    {
        foreach (string e in events)
        {
            await p.ApplyAsync($"game:{Game:N}", e, CancellationToken.None);
        }
    }

    [Fact]
    public async Task Created_inserts_the_game_and_one_row_per_player_with_names_snapshotted()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created());

            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal((Game, "testuser", "player", "5+3", "playing", 0, StartFen, 1L), (game.GameId, game.WhiteName, game.BlackName, game.TimeControl, game.Status, game.Ply, game.LastFen, game.LastSeq));
            Assert.Equal((T0, T0), (game.CreatedAt, game.UpdatedAt));

            List<RmGamePlayer> players = await db.RmGamePlayers.AsNoTracking().OrderBy(r => r.UserId).ToListAsync();
            Assert.Equal([(1L, "white", 2L, "player"), (2L, "black", 1L, "testuser")], players.Select(r => (r.UserId, r.Color, r.OpponentId, r.OpponentName)));
        }
    }

    [Fact]
    public async Task A_player_without_a_username_is_shown_as_player_and_id()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created(white: 1, black: 7)); // no user 7 row with a name

            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal(("testuser", "Player 7"), (game.WhiteName, game.BlackName));
        }
    }

    [Fact]
    public async Task Each_move_adds_one_row_and_advances_the_game()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created(), FoolsMate[0], FoolsMate[0]); // second one is a redelivery

            RmMove move = await db.RmMoves.AsNoTracking().SingleAsync();
            Assert.Equal((1, "f2f3", "f3", "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1"), (move.Ply, move.Uci, move.San, move.FenAfter));
            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal((1, move.FenAfter, 2L, T0.AddSeconds(2)), (game.Ply, game.LastFen, game.LastSeq, game.UpdatedAt));
        }
    }

    [Fact]
    public async Task A_gap_stalls_and_writes_nothing()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created(), FoolsMate[0]);

            await Assert.ThrowsAsync<ProjectionGapException>(() => ApplyAll(p, FoolsMate[2])); // seq 4 after 2

            Assert.Equal(2L, (await db.RmGames.AsNoTracking().SingleAsync()).LastSeq);
            Assert.Equal(1, await db.RmMoves.CountAsync());
        }
    }

    [Fact]
    public async Task A_move_for_a_game_never_created_is_a_gap() =>
        await Assert.ThrowsAsync<ProjectionGapException>(() => ApplyAll(Build().Projection, FoolsMate[0]));

    [Fact]
    public async Task The_ending_closes_the_game_and_stores_its_pgn()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            DateTimeOffset end = T0.AddSeconds(6);
            await ApplyAll(p, [Created(), .. FoolsMate, Env("game.ended", 6, new GameEnded("0-1", "Checkmate", 300_000, 300_000, end), end)]);

            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal(("ended", "0-1", "Checkmate", end, end, 6L), (game.Status, game.Result, game.Reason, game.EndedAt, game.UpdatedAt, game.LastSeq));
            Assert.Equal(
                """
                [Event "Live game"]
                [Site "chess"]
                [Date "2026.09.26"]
                [Round "-"]
                [White "testuser"]
                [Black "player"]
                [Result "0-1"]
                [TimeControl "300+3"]
                [Termination "normal"]

                1. f3 e5 2. g4 Qh4# 0-1

                """.ReplaceLineEndings("\n"),
                game.Pgn);
        }
    }

    [Fact]
    public async Task An_aborted_game_is_ended_with_no_result()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created(), Env("game.ended", 2, new GameEnded("*", "Aborted", 300_000, 300_000, T0.AddMinutes(1)), T0.AddMinutes(1)));

            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal(("ended", "*", "Aborted"), (game.Status, game.Result, game.Reason));
            Assert.EndsWith("\n*\n", game.Pgn, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Draw_events_only_advance_the_watermark()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, Created(), FoolsMate[0], Env("game.draw-offered", 3, new DrawOffered(2, T0.AddSeconds(30)), T0.AddSeconds(30)), Env("game.draw-declined", 4, new DrawDeclined(1, T0.AddSeconds(31)), T0.AddSeconds(31)));

            RmGame game = await db.RmGames.AsNoTracking().SingleAsync();
            Assert.Equal((4L, 1, "playing", T0.AddSeconds(2)), (game.LastSeq, game.Ply, game.Status, game.UpdatedAt));
        }
    }

    [Fact]
    public async Task Foreign_and_unreadable_records_are_ignored()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            await ApplyAll(p, "not json", Env("ping.pinged", 1, new Pinged("x", 1, T0), T0), Env("game.unknown", 1, new { a = 1 }, T0));

            Assert.Equal(0, await db.RmGames.CountAsync());
        }
    }

    [Fact]
    public void Identifies_its_topic_and_group()
    {
        (ProjectDbContext db, GameProjection p) = Build();
        using (db)
        {
            Assert.Equal(("game.events", "chess.rm-games"), (p.Topic, p.GroupId));
        }
    }
}
