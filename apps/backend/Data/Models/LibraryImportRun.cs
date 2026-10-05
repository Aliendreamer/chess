namespace Chess.Backend.Data.Models;

/// <summary>
/// One import of a month of lichess broadcasts into the library (broadcast-explorer D1): what was read, kept, imported,
/// already there, or refused, saved after every batch so the admin page shows it while it runs.
/// </summary>
internal sealed class LibraryImportRun
{
    public const string Running = "running";
    public const string Finished = "finished";
    public const string Failed = "failed";

    public Guid Id { get; set; }

    /// <summary><c>YYYY-MM</c>.</summary>
    public required string Month { get; set; }

    /// <summary><see cref="Running"/>, <see cref="Finished"/> or <see cref="Failed"/>.</summary>
    public required string State { get; set; }

    /// <summary>Games read from the file.</summary>
    public int Read { get; set; }

    /// <summary>Games the filter kept.</summary>
    public int Kept { get; set; }

    public int Imported { get; set; }

    public int Duplicate { get; set; }

    /// <summary>Kept games that did not replay (a broadcast board records an illegal move now and then).</summary>
    public int Refused { get; set; }

    /// <summary>Why a failed run stopped.</summary>
    public string? Error { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }
}
