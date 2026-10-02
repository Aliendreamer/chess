namespace Chess.Backend.Data.Models;

/// <summary>
/// A famous game in the club's library (game-library): moves and factual headers only — never annotations — with where
/// it came from and under which licence, shown wherever the game is. Written by the admin import, read from the
/// replica.
/// </summary>
internal sealed class LibraryGame
{
    public Guid Id { get; set; }

    public required string White { get; set; }

    public required string Black { get; set; }

    public string? Event { get; set; }

    public string? Site { get; set; }

    public string? Round { get; set; }

    /// <summary>PGN's date as written, partial dates kept (<c>1886.??.??</c>).</summary>
    public string? DateText { get; set; }

    /// <summary>The year search filters on; null when the date has none.</summary>
    public int? Year { get; set; }

    /// <summary><c>1-0</c>, <c>0-1</c>, <c>1/2-1/2</c> or <c>*</c>.</summary>
    public required string Result { get; set; }

    public string? Eco { get; set; }

    public string? OpeningName { get; set; }

    /// <summary>A World Championship game: set by the import, never inferred from the event name.</summary>
    public bool WorldChampionship { get; set; }

    public required List<string> MovesUci { get; set; }

    public int Ply { get; set; }

    /// <summary>Where the game came from, e.g. "PGN Mentor".</summary>
    public required string Source { get; set; }

    /// <summary>Under what terms, e.g. "CC BY-SA 4.0" or "moves only (facts)".</summary>
    public required string Licence { get; set; }

    /// <summary>The source's own reference: a file name or URL.</summary>
    public string? SourceRef { get; set; }

    /// <summary>Players (any case or spacing), year and moves: the same game imported twice is found by this.</summary>
    public required string DedupeKey { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
