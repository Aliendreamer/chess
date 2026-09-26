using System.Globalization;
using System.Text.Json;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Events;
using Chess.Backend.Games;

namespace Chess.Backend.Projections;

/// <summary>
/// Projects <c>game.events</c> into <c>rm_games</c>, <c>rm_game_players</c> and <c>rm_moves</c> (game-history). The
/// watermark lives on the game's own row (<see cref="RmGame.LastSeq"/>, a concurrency token): every event is guarded
/// against it, applied, and saved together with the new watermark in one SaveChanges. Names are snapshotted at
/// creation (D23); the PGN is built from the projected moves when the game ends (D22).
/// </summary>
internal sealed class GameProjection(ProjectDbContext db, ILogger<GameProjection> logger) : IProjection
{
    public const string StartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    /// <summary>The PGN <c>Site</c> tag.</summary>
    public const string Site = "chess";

    public string Topic => "game.events";

    public string GroupId => "chess.rm-games";

    public async Task ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<JsonElement>? e)
            || !IsGameEvent(e.Type)
            || !Guid.TryParseExact(e.AggregateId, "N", out Guid gameId))
        {
            return; // other aggregates share the topic; unreadable records are the runner's to park
        }

        RmGame? game = await db.RmGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        long lastSeq = game?.LastSeq ?? 0;
        switch (IdempotencyGuard.Decide(lastSeq, e.Seq))
        {
            case SeqDecision.Skip:
                Log.ProjectionSkippedReplay(logger, e.AggregateId, e.Seq);
                return;
            case SeqDecision.Gap:
                Log.ProjectionGap(logger, GroupId, e.AggregateId, lastSeq, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, lastSeq, e.Seq);
        }

        game = e.Type switch
        {
            "game.created" => await CreateAsync(gameId, Payload<GameCreated>(e), ct),
            "game.move-made" => Moved(game!, gameId, Payload<MoveMade>(e)),
            "game.ended" => await EndedAsync(game!, Payload<GameEnded>(e), ct),
            _ => game!, // draw offered / declined: nothing to show in lists, only the watermark moves
        };
        game.LastSeq = e.Seq;
        await db.SaveChangesAsync(ct);
    }

    private static bool IsGameEvent(string type) =>
        type is "game.created" or "game.move-made" or "game.draw-offered" or "game.draw-declined" or "game.ended";

    private static T Payload<T>(EventEnvelope<JsonElement> e) =>
        e.Payload.Deserialize<T>(EventJson.Options)
        ?? throw new InvalidOperationException($"{e.Type} {e.AggregateId}#{e.Seq} has no payload.");

    private async Task<RmGame> CreateAsync(Guid gameId, GameCreated c, CancellationToken ct)
    {
        Dictionary<long, string?> names = await db.Users.AsNoTracking()
            .Where(u => u.Id == c.WhiteId || u.Id == c.BlackId)
            .ToDictionaryAsync(u => u.Id, u => u.Username, ct);
        string white = NameOf(names, c.WhiteId);
        string black = NameOf(names, c.BlackId);
        RmGame game = new()
        {
            GameId = gameId,
            WhiteId = c.WhiteId,
            WhiteName = white,
            BlackId = c.BlackId,
            BlackName = black,
            TimeControl = c.TimeControl,
            Status = RmGame.Playing,
            LastFen = StartFen,
            WhiteMs = c.InitialMs,
            BlackMs = c.InitialMs,
            CreatedAt = c.At,
            UpdatedAt = c.At,
        };
        db.RmGames.Add(game);
        db.RmGamePlayers.AddRange(
            new RmGamePlayer { UserId = c.WhiteId, GameId = gameId, Color = RmGamePlayer.White, OpponentId = c.BlackId, OpponentName = black, CreatedAt = c.At },
            new RmGamePlayer { UserId = c.BlackId, GameId = gameId, Color = RmGamePlayer.Black, OpponentId = c.WhiteId, OpponentName = white, CreatedAt = c.At });
        return game;
    }

    private RmGame Moved(RmGame game, Guid gameId, MoveMade m)
    {
        db.RmMoves.Add(new RmMove
        {
            GameId = gameId,
            Ply = m.Ply,
            Uci = m.Uci,
            San = m.San,
            FenAfter = m.FenAfter,
            WhiteMs = m.WhiteMs,
            BlackMs = m.BlackMs,
            At = m.At,
        });
        game.Ply = m.Ply;
        game.LastFen = m.FenAfter;
        game.LastUci = m.Uci;
        game.LastSan = m.San;
        game.WhiteMs = m.WhiteMs;
        game.BlackMs = m.BlackMs;
        game.UpdatedAt = m.At;
        return game;
    }

    private async Task<RmGame> EndedAsync(RmGame game, GameEnded end, CancellationToken ct)
    {
        // Every move has a lower seq than the ending, so the guard has already projected all of them.
        List<string> san = await db.RmMoves.AsNoTracking()
            .Where(m => m.GameId == game.GameId)
            .OrderBy(m => m.Ply)
            .Select(m => m.San)
            .ToListAsync(ct);
        game.Status = RmGame.Ended;
        game.Result = end.Result;
        game.Reason = end.Reason;
        game.EndedAt = end.At;
        game.UpdatedAt = end.At;
        game.WhiteMs = end.WhiteMs;
        game.BlackMs = end.BlackMs;
        game.Pgn = Pgn.Build(new PgnGame(Site, game.CreatedAt, game.WhiteName, game.BlackName, game.TimeControl, end.Result, end.Reason, san));
        return game;
    }

    private static string NameOf(Dictionary<long, string?> names, long userId) =>
        names.TryGetValue(userId, out string? name) && !string.IsNullOrEmpty(name)
            ? name
            : string.Create(CultureInfo.InvariantCulture, $"Player {userId}");
}
