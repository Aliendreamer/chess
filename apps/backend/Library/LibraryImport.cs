using System.Security.Cryptography;
using System.Text;
using Chess.Backend.Analysis;
using Chess.Backend.Games;

namespace Chess.Backend.Library;

/// <summary>One game as the browser parsed it from PGN (game-library D3): factual headers and UCI moves, nothing else.</summary>
internal sealed record ImportGame(
    string White,
    string Black,
    string? Event,
    string? Site,
    string? Round,
    string? Date,
    string Result,
    string? Eco,
    IReadOnlyList<string> Moves,
    string? StartFen);

/// <summary>Where a batch of games came from and under which terms; every game of the batch carries it.</summary>
internal sealed record ImportSource(string Source, string Licence, string? SourceRef, bool WorldChampionship);

internal abstract record ImportOutcome;

/// <summary>A game ready to store: the row and every position it reached.</summary>
internal sealed record PreparedGame(LibraryGame Game, IReadOnlyList<LibraryPosition> Positions) : ImportOutcome;

internal sealed record RefusedGame(string Error) : ImportOutcome;

/// <summary>
/// The import's rules (game-library D3), pure: a library game starts from the standard position and every move must
/// replay, with no automatic draws (only a player's claim ends a real game that way); its positions are keyed like the analysis cache (<see cref="PositionKey"/>); its opening is the deepest named
/// position it reaches unless the PGN names its own ECO; the same game twice is found by <see cref="DedupeKey"/>.
/// </summary>
internal static class LibraryImport
{
    private static readonly string[] Results = ["1-0", "0-1", "1/2-1/2", "*"];

    private const string StandardStart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    public static ImportOutcome Prepare(ImportGame game, ImportSource source, IReadOnlyDictionary<string, Opening> openings, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(game);
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(openings);
        if (string.IsNullOrWhiteSpace(game.White) || string.IsNullOrWhiteSpace(game.Black))
        {
            return new RefusedGame("Both players must be named.");
        }

        if (!string.IsNullOrWhiteSpace(game.StartFen))
        {
            return new RefusedGame("A library game starts from the standard position (this one has a FEN).");
        }

        if (game.Moves.Count == 0)
        {
            return new RefusedGame("The game has no moves.");
        }

        if (!Results.Contains(game.Result, StringComparer.Ordinal))
        {
            return new RefusedGame($"Unknown result: {game.Result}.");
        }

        Guid id = Guid.CreateVersion7(now);
        // No automatic endings (as in studies): a repetition or fifty moves end a real game only when a player claims
        // them, and famous games went on past unclaimed ones. Checkmate and stalemate still end it.
        ChessRules rules = ChessRules.ForStudy(StandardStart) ?? throw new InvalidOperationException("The start position did not load.");
        List<LibraryPosition> positions = [];
        Opening? opening = null;
        for (int i = 0; i < game.Moves.Count; i++)
        {
            if (rules.TryApply(game.Moves[i]) is MoveRejected rejected)
            {
                return new RefusedGame($"Illegal move {i + 1} ({game.Moves[i]}): {rejected.Reason}");
            }

            string key = PositionKey.Of(rules.Fen) ?? throw new InvalidOperationException("The rules library produced no position.");
            positions.Add(new LibraryPosition { PositionKey = key, GameId = id, Ply = i + 1 });
            if (openings.TryGetValue(key, out Opening? named))
            {
                opening = named;
            }
        }

        int? year = YearOf(game.Date);
        return new PreparedGame(
            new LibraryGame
            {
                Id = id,
                White = game.White.Trim(),
                Black = game.Black.Trim(),
                Event = Clean(game.Event),
                Site = Clean(game.Site),
                Round = Clean(game.Round),
                DateText = Clean(game.Date),
                Year = year,
                Result = game.Result,
                Eco = Clean(game.Eco) ?? opening?.Eco,
                OpeningName = opening?.Name,
                WorldChampionship = source.WorldChampionship,
                MovesUci = [.. game.Moves],
                Ply = game.Moves.Count,
                Source = source.Source,
                Licence = source.Licence,
                SourceRef = source.SourceRef,
                DedupeKey = DedupeKey(game.White, game.Black, year, game.Moves),
                CreatedAt = now,
            },
            positions);
    }

    /// <summary>The year of a PGN date (<c>1886.??.??</c> → 1886); null when it has none.</summary>
    public static int? YearOf(string? date) =>
        date is { Length: >= 4 } && int.TryParse(date.AsSpan(0, 4), System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out int year)
            ? year
            : null;

    /// <summary>Players without case or extra spaces, the year, and a hash of the moves: one key per game.</summary>
    public static string DedupeKey(string white, string black, int? year, IEnumerable<string> moves)
    {
        string hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join(' ', moves))))[..32];
        return $"{Normalise(white)}|{Normalise(black)}|{year}|{hash}";
    }

    private static string Normalise(string name) =>
        string.Join(' ', name.Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) || value.Trim() == "?" ? null : value.Trim();
}
