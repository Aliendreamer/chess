using Chess.Backend.Akka.Ping;

namespace Chess.Backend.WebApi.Pings;

/// <summary>
/// Maps a ping actor reply to the HTTP outcome a ping endpoint should send. Kept out of the endpoints
/// themselves (which are thin and <see cref="ExcludeFromCodeCoverageAttribute"/>) so the command and live
/// endpoints answer identically for the same reply shape, and so that mapping is unit-testable on its own.
/// </summary>
internal static class PingReplyMapper
{
    public static PingReplyOutcome Map(object reply)
    {
        ArgumentNullException.ThrowIfNull(reply);
        return reply switch
        {
            PingState state => PingReplyOutcome.Ok(state),
            PingRejected rejected => PingReplyOutcome.Error(StatusCodes.Status400BadRequest, rejected.Reason),
            _ => PingReplyOutcome.Error(StatusCodes.Status502BadGateway, "Unexpected reply from ping actor."),
        };
    }
}

/// <summary>Either a successful <see cref="PingState"/> or an HTTP status/message to raise via ThrowError.</summary>
internal readonly record struct PingReplyOutcome(PingState? State, int ErrorStatusCode, string? ErrorMessage)
{
    public bool IsSuccess => State is not null;

    public static PingReplyOutcome Ok(PingState state) => new(state, 0, null);

    public static PingReplyOutcome Error(int statusCode, string message) => new(null, statusCode, message);
}
