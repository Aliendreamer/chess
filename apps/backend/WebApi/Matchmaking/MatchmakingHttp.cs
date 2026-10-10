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

/// <summary>Invite (rematch) replies → HTTP. An invalid colour or time control is the request's fault: 400, not 422.</summary>
internal static class InviteHttp
{
    public static (int Status, object? Body, string? Error) Map(object reply) => reply switch
    {
        InviteView view => (StatusCodes.Status200OK, view, null),
        InviteRejected r => (r.Code switch
        {
            RejectionCode.Forbidden => StatusCodes.Status403Forbidden,
            RejectionCode.Illegal => StatusCodes.Status400BadRequest,
            RejectionCode.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status404NotFound,
        }, null, r.Reason),
        _ => (StatusCodes.Status502BadGateway, null, "Unexpected reply."),
    };
}
