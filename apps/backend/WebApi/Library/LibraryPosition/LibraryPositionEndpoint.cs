using Chess.Backend.Analysis;
using Chess.Backend.Games;
using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;
using Npgsql;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.WebApi.Library;

/// <summary>The library games that reached a position (game-library): "In the library" on the analysis board.</summary>
[ExcludeFromCodeCoverage]
internal sealed class LibraryPositionEndpoint(ReadDbContext read, IFusionCache cache, IOptions<LibraryOptions> options)
    : Endpoint<LibraryPositionRequest, LibraryPositionView>
{
    private const int Shown = 50;

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
            // One answer per (position, source) for a while (broadcast-explorer D9): the first plies are asked by everyone.
            LibrarySource source = req.SourceChoice;
            LibraryPositionView view = await cache.GetOrSetAsync(
                $"{Constants.Cache.LibraryPosition}{req.Key}:{source}",
                async (FusionCacheFactoryExecutionContext<LibraryPositionView> _, CancellationToken token) => await BuildAsync(req.Key, source, token),
                o => o.SetDuration(TimeSpan.FromMinutes(options.Value.ExplorerCacheMinutes)),
                ct);
            await Send.OkAsync(view, ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }

    private async Task<LibraryPositionView> BuildAsync(string key, LibrarySource source, CancellationToken ct)
    {
        (PositionCounts counts, IReadOnlyList<ExplorerMove> moves) = await LibraryReads.ExploreAsync(read.LibraryPositions, key, source, ct);
        List<PositionGame> items = [.. (await LibraryReads.GamesAtAsync(read.LibraryPositions, read.LibraryGames, key, source, Shown, ct))
            .Select(r => new PositionGame(r.Game.Id, r.Game.White, r.Game.Black, r.Game.Year, r.Game.Event, r.Game.Result, r.Ply, r.Game.Source, r.Game.SourceRef))];
        return new LibraryPositionView(counts.Games, counts.WhiteWins, counts.Draws, counts.BlackWins, items, await NamedAsync(key, moves, ct));
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
