namespace Chess.Backend.Data.ReadModels;

/// <summary>One row per player per game: "my games" is one index seek on (UserId, CreatedAt, GameId).</summary>
internal sealed class RmGamePlayer
{
    public const string White = "white";
    public const string Black = "black";

    public long UserId { get; set; }

    public Guid GameId { get; set; }

    public required string Color { get; set; }

    public long OpponentId { get; set; }

    public required string OpponentName { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
