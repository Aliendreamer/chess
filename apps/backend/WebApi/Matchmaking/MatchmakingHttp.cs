using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.WebApi.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>Matchmaking replies → HTTP (the tested piece behind the thin endpoints).</summary>
internal static class MatchmakingHttp
{
    public static (int Status, JoinQueueResponse? Body) Map(object reply) => reply switch
    {
        Waiting w => (StatusCodes.Status200OK, new JoinQueueResponse(QueueStatus.Waiting, w.TimeControl, w.Position, w.WaitingCount, null, null, null, w.Seq)),
        Matched m => (StatusCodes.Status200OK, new JoinQueueResponse(QueueStatus.Matched, m.TimeControl, null, null, m.GameId, m.WhiteId, m.BlackId, null)),
        QueueRejected => (StatusCodes.Status400BadRequest, null),
        Left => (StatusCodes.Status204NoContent, null),
        _ => (StatusCodes.Status502BadGateway, null),
    };
}
