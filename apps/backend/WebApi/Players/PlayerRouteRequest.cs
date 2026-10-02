namespace Chess.Backend.WebApi.Players;

/// <summary>A player by id: a <c>users</c> id, negative for the computer players (engine-play D2).</summary>
internal sealed class PlayerRouteRequest
{
    public long Id { get; init; }
}
