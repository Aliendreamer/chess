using System.Reflection;
using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Microsoft.EntityFrameworkCore.Storage;

namespace Chess.Backend.Library;

/// <summary>
/// The opening names (game-library D4): lichess's <c>chess-openings</c> list (CC0), embedded as five TSV files
/// (tab-separated eco, name, pgn), each line replayed to the position it names. Seeded into <c>openings</c> at startup when the table
/// is empty.
/// </summary>
internal static class OpeningSeed
{
    /// <summary>The <c>pg_advisory_xact_lock</c> key that keeps two nodes from seeding at once.</summary>
    private const long SeedLock = 0x4f50454e494e4753; // "OPENINGS"

    /// <summary>One row replayed from the start; null when a move does not replay (the row is skipped, not trusted).</summary>
    public static Opening? Parse(string eco, string name, string pgn)
    {
        ChessRules rules = ChessRules.NewGame();
        List<string> moves = [];
        foreach (string token in (pgn ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (token.EndsWith('.'))
            {
                continue; // a move number: "1." or "3..."
            }

            if (rules.TryApplySan(token) is not MoveApplied applied)
            {
                return null;
            }

            moves.Add(applied.Uci);
        }

        return moves.Count > 0 && PositionKey.Of(rules.Fen) is { } key
            ? new Opening { PositionKey = key, Eco = eco, Name = name, Ply = moves.Count, MovesUci = moves }
            : null;
    }

    /// <summary>Every embedded row that replays, one per position (the first name the list gives it).</summary>
    public static IEnumerable<Opening> ReadEmbedded()
    {
        Assembly assembly = typeof(OpeningSeed).Assembly;
        HashSet<string> seen = new(StringComparer.Ordinal);
        foreach (string resource in assembly.GetManifestResourceNames().Where(n => n.StartsWith("openings.", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            using Stream stream = assembly.GetManifestResourceStream(resource)!;
            using StreamReader reader = new(stream);
            reader.ReadLine(); // the header: eco, name, pgn
            while (reader.ReadLine() is { } line)
            {
                string[] cells = line.Split('\t');
                if (cells.Length == 3 && Parse(cells[0], cells[1], cells[2]) is { } opening && seen.Add(opening.PositionKey))
                {
                    yield return opening;
                }
            }
        }
    }

    /// <summary>Fills <c>openings</c> under an advisory lock when it is empty or its rows predate the moves column.</summary>
    public static async Task SeedAsync(ProjectDbContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (!context.Database.IsRelational())
        {
            return; // the in-memory store of unit tests: no locks, no transactions, nothing to name
        }

        // The context retries on failure, so the transaction runs through its strategy as one retriable unit.
        await context.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using IDbContextTransaction transaction = await context.Database.BeginTransactionAsync(ct);
            await context.Database.ExecuteSqlAsync($"select pg_advisory_xact_lock({SeedLock})", ct);
            // Seeded and complete: nothing to do. Rows from before the trainer lack their moves: refill once.
            if (await context.Openings.AnyAsync(ct) && !await context.Openings.AnyAsync(o => o.MovesUci == null, ct))
            {
                return;
            }

            // A set-based delete: removing and re-adding the same keys through the tracker would clash.
            await context.Openings.ExecuteDeleteAsync(ct);
            context.Openings.AddRange(ReadEmbedded());
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        });
    }
}
