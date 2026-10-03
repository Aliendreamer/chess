using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Library;

/// <summary>The library games that reached a position (game-library): "In the library" on the analysis board.</summary>
[ExcludeFromCodeCoverage]
internal sealed class LibraryPositionEndpoint(ReadDbContext read) : Endpoint<LibraryPositionRequest, LibraryPositionView>
{
    private const int Shown = 50;

    private static readonly string StartKey = PositionKey.Of("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")!;

    public override void Configure()
    {
        Get("library/positions");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Library")
            .Produces<LibraryPositionView>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(LibraryPositionRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = LibraryHttp.CacheControl;
        try
        {
            // A game may pass through a position twice (a repetition): it counts once, at its first visit. The start
            // position is not stored (every game has it): there every game counts, at ply 0.
            var rows = req.Key == StartKey
                ? await read.LibraryGames.Select(g => new { Ply = 0, Game = g }).ToListAsync(ct)
                : await read.LibraryPositions
                    .Where(p => p.PositionKey == req.Key)
                    .GroupBy(p => p.GameId)
                    .Select(g => new { GameId = g.Key, Ply = g.Min(p => p.Ply) })
                    .Join(read.LibraryGames, p => p.GameId, g => g.Id, (p, g) => new { p.Ply, Game = g })
                    .ToListAsync(ct);
            PositionCounts counts = LibraryReads.Count([.. rows.Select(r => r.Game.Result)]);
            List<PositionGame> items = [.. rows
                .OrderByDescending(r => r.Game.Year ?? -1)
                .ThenBy(r => r.Game.White, StringComparer.Ordinal)
                .Take(Shown)
                .Select(r => new PositionGame(r.Game.Id, r.Game.White, r.Game.Black, r.Game.Year, r.Game.Event, r.Game.Result, r.Ply))];
            IReadOnlyList<ExplorerMove> moves = LibraryReads.Explore(rows.Select(r => new GameAtPosition(r.Game.MovesUci, r.Ply, r.Game.Result)));
            await Send.OkAsync(
                new LibraryPositionView(counts.Games, counts.WhiteWins, counts.Draws, counts.BlackWins, items, await NamedAsync(req.Key, moves, ct)),
                ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }

    /// <summary>Each move with the opening name of the position it reaches, when that position is named.</summary>
    private async Task<IReadOnlyList<ExplorerMoveView>> NamedAsync(string key, IReadOnlyList<ExplorerMove> moves, CancellationToken ct)
    {
        Dictionary<string, string> reached = new(StringComparer.Ordinal);
        foreach (ExplorerMove move in moves)
        {
            ChessRules? rules = ChessRules.ForStudy($"{key} 0 1");
            if (rules?.TryApply(move.Uci) is MoveApplied applied && PositionKey.Of(applied.FenAfter) is { } next)
            {
                reached[move.Uci] = next;
            }
        }

        List<string> keys = [.. reached.Values.Distinct(StringComparer.Ordinal)];
        Dictionary<string, Opening> names = await read.Openings.Where(o => keys.Contains(o.PositionKey)).ToDictionaryAsync(o => o.PositionKey, StringComparer.Ordinal, ct);
        return [.. moves.Select(m =>
        {
            Opening? named = reached.TryGetValue(m.Uci, out string? next) ? names.GetValueOrDefault(next) : null;
            return new ExplorerMoveView(m.Uci, m.Games, m.WhiteWins, m.Draws, m.BlackWins, named?.Eco, named?.Name);
        })];
    }
}
