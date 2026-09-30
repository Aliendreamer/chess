using System.Text.Json;
using Akka.Actor;
using Akka.Hosting;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Events;
using Chess.Backend.Extensions;
using Chess.Backend.Games;
using Chess.Backend.Projections;

namespace Chess.Backend.Engine;

/// <summary>
/// Asks the engine for a move whenever a game against it leaves the engine to move (engine-play D6): at creation when
/// the engine is White, and after each move that hands it the turn. It reads <c>game.events</c> like any projection;
/// the game's <see cref="EngineGame"/> row holds its watermark, so every event is guarded and a replay asks nothing
/// twice. A request is produced before the watermark is saved: a crash in between asks again, which is harmless.
/// </summary>
internal sealed class EngineRequestConsumer(ProjectDbContext db, IEngineRequests requests, ILogger<EngineRequestConsumer> logger) : IProjection
{
    public string Topic => "game.events";

    public string GroupId => "chess.engine-requests";

    public async Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
    {
        if (!EventJson.TryDeserialize(json, out EventEnvelope<JsonElement>? e)
            || !e.Type.StartsWith("game.", StringComparison.Ordinal)
            || !Guid.TryParseExact(e.AggregateId, "N", out Guid gameId))
        {
            return ProjectionOutcome.Ignored; // pings share the topic; unreadable records are the runner's to park
        }

        EngineGame? game = await db.EngineGames.SingleOrDefaultAsync(g => g.GameId == gameId, ct);
        if (game is null)
        {
            return await StartAsync(gameId, e, ct);
        }

        switch (IdempotencyGuard.Decide(game.LastSeq, e.Seq))
        {
            case SeqDecision.Skip:
                return ProjectionOutcome.Skipped;
            case SeqDecision.Gap:
                Utils.Log.ProjectionGap(logger, GroupId, e.AggregateId, game.LastSeq, e.Seq);
                throw new ProjectionGapException(GroupId, e.AggregateId, game.LastSeq, e.Seq);
        }

        if (e.Type == "game.move-made" && !game.Ended
            && e.Payload.Deserialize<MoveMade>() is { } move && SideToMove(move.FenAfter) == game.Side)
        {
            await requests.RequestAsync(gameId, move.Ply, move.FenAfter, game.Level, ct);
            Utils.Log.EngineRequested(logger, gameId, move.Ply, game.Level);
        }
        else if (e.Type == "game.ended")
        {
            game.Ended = true;
        }

        game.LastSeq = e.Seq;
        await db.SaveChangesAsync(ct);
        return ProjectionOutcome.Applied;
    }

    /// <summary>A game this consumer has no row for: only the creation of a game against the engine matters.</summary>
    private async Task<ProjectionOutcome> StartAsync(Guid gameId, EventEnvelope<JsonElement> e, CancellationToken ct)
    {
        if (e.Type != "game.created" || e.Payload.Deserialize<GameCreated>() is not { Engine: { } engine })
        {
            return ProjectionOutcome.Ignored; // a game between people, or a later event of one
        }

        if (engine.Side == "white")
        {
            await requests.RequestAsync(gameId, 0, GameProjection.StartFen, engine.Level, ct);
            Utils.Log.EngineRequested(logger, gameId, 0, engine.Level);
        }

        db.EngineGames.Add(new EngineGame { GameId = gameId, Side = engine.Side, Level = engine.Level, LastSeq = e.Seq });
        await db.SaveChangesAsync(ct);
        return ProjectionOutcome.Applied;
    }

    /// <summary>The FEN's second field: <c>w</c> or <c>b</c>, as the side names games use.</summary>
    internal static string SideToMove(string fen) =>
        fen.Split(' ') is [_, "b", ..] ? "black" : "white";
}

/// <summary>
/// Applies the engine's answers (engine-play D6): each becomes an ordinary move by the level's player, pinned to the
/// ply it was asked for. The game refuses a stale, duplicate or late answer (the ply moved on, the game ended), which
/// is expected with at-least-once delivery and only logged.
/// </summary>
internal sealed class EngineMoveConsumer(IRequiredActor<GameActor> games, IOptions<ApiOptions> api, ILogger<EngineMoveConsumer> logger) : IProjection
{
    public string Topic => EngineTopics.Results;

    public string GroupId => "chess.engine-moves-apply";

    public async Task<ProjectionOutcome> ApplyAsync(string key, string json, CancellationToken ct)
    {
        EngineMoveResult? result;
        try
        {
            result = JsonSerializer.Deserialize<EngineMoveResult>(json);
        }
        catch (JsonException)
        {
            return ProjectionOutcome.Ignored;
        }

        if (result is null
            || !Guid.TryParseExact(result.GameId, "N", out Guid gameId)
            || EngineLevel.Find(result.Level) is not { } level
            || string.IsNullOrEmpty(result.Uci))
        {
            return ProjectionOutcome.Ignored;
        }

        object reply = await games.ActorRef.Ask(ActorTracing.Wrap(new MakeMove(gameId, level.UserId, result.Uci, result.Ply)), api.Value.AskTimeout, ct);
        if (reply is GameRejected rejected)
        {
            // Stale, duplicate or late: the game's own idempotency, so it counts as a skip.
            Utils.Log.EngineMoveDropped(logger, gameId, result.Ply, rejected.Reason);
            return ProjectionOutcome.Skipped;
        }

        return ProjectionOutcome.Applied;
    }
}
