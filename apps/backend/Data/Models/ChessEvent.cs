namespace Chess.Backend.Data.Models;

/// <summary>
/// A tournament being played now, from lichess's broadcast list (chess-news D6): names, place, time control and the
/// current round with their lichess links — never games or images. The whole set is replaced on every fetch.
/// </summary>
internal sealed class ChessEvent
{
    /// <summary>lichess's tournament id.</summary>
    public required string Id { get; set; }

    public required string Name { get; set; }

    public required string Url { get; set; }

    public string? RoundName { get; set; }

    public string? RoundUrl { get; set; }

    /// <summary>A round is being played right now.</summary>
    public bool Ongoing { get; set; }

    public string? Location { get; set; }

    /// <summary>lichess's <c>fideTC</c>: <c>standard</c>, <c>rapid</c> or <c>blitz</c>.</summary>
    public string? FideTc { get; set; }

    /// <summary>lichess's importance: the higher, the more prominent.</summary>
    public int Tier { get; set; }

    public DateTimeOffset? StartsAt { get; set; }

    public DateTimeOffset? EndsAt { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
