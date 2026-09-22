namespace Chess.Backend.Akka.Ping;

internal interface IPingCommand
{
    string PingId { get; }
}

internal sealed record Ping(string PingId, string Text, long UserId) : IPingCommand;

internal sealed record GetPingState(string PingId) : IPingCommand;

internal sealed record PingState(string PingId, long Count, string? LastText, DateTimeOffset? LastAt, long LastSeq);

internal sealed record PingRejected(string PingId, string Reason);

/// <summary>Journal snapshot payload — kept separate from the reply type so the reply can evolve freely.</summary>
internal sealed record PingSnapshot(long Count, string? LastText, DateTimeOffset? LastAt);
