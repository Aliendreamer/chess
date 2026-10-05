using System.Globalization;
using Akka.Actor;
using Akka.Event;
using Chess.Backend.Akka;

namespace Chess.Backend.Library;

/// <summary>
/// Imports one month of lichess broadcasts (broadcast-explorer D1): streams the file through the decoder, the PGN reader
/// and the filter, and stores kept games in batches through <see cref="ILibraryService"/>, saving the run's counts
/// after each. The URL is built from the month only. Rerunning a month is safe: the dedupe key skips stored games.
/// </summary>
internal interface IBroadcastImports
{
    /// <summary>A new run, <c>running</c>, for <paramref name="month"/>.</summary>
    Task<Guid> CreateRunAsync(string month, CancellationToken ct);

    /// <summary>Runs it to the end; never throws: a failure is written to the run.</summary>
    Task RunAsync(Guid runId, string month, CancellationToken ct);

    /// <summary>Runs left <c>running</c> by a node that went away are marked failed.</summary>
    Task MarkInterruptedAsync(CancellationToken ct);

    Task<IReadOnlyList<LibraryImportRun>> RecentAsync(int limit, CancellationToken ct);
}

internal sealed class BroadcastImports(
    IHttpClientFactory http,
    IServiceScopeFactory scopes,
    LibraryBroadcastsOptions options,
    TimeProvider clock,
    ILogger<BroadcastImports> logger) : IBroadcastImports
{
    public const string HttpClientName = "lichess-broadcasts";

    /// <summary>The month's file: fixed host and path from settings, the month checked first (no URL from input).</summary>
    public Uri UrlOf(string month) =>
        BroadcastFilter.IsMonth(month)
            ? new Uri($"{options.BaseUrl}lichess_db_broadcast_{month}.pgn.zst")
            : throw new ArgumentException($"Not a month: {month}.", nameof(month));

    public async Task<Guid> CreateRunAsync(string month, CancellationToken ct)
    {
        LibraryImportRun run = new() { Id = Guid.CreateVersion7(), Month = month, State = LibraryImportRun.Running, StartedAt = clock.GetUtcNow() };
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        db.LibraryImportRuns.Add(run);
        await db.SaveChangesAsync(ct);
        return run.Id;
    }

    public async Task RunAsync(Guid runId, string month, CancellationToken ct)
    {
        Counts counts = new();
        try
        {
            using HttpResponseMessage response = await http.CreateClient(HttpClientName)
                .GetAsync(UrlOf(month), HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                await FailAsync(runId, month, counts, $"lichess answered {(int)response.StatusCode} for {month}.", null, ct);
                return;
            }

            await using Stream body = await response.Content.ReadAsStreamAsync(ct);
            using TextReader text = BroadcastFile.Open(body);
            ImportSource source = new(BroadcastFilter.Source, BroadcastFilter.Licence, null, WorldChampionship: false, options.PositionPlies);
            List<ImportGame> batch = new(options.BatchSize);
            await foreach (PgnGame game in PgnReader.ReadAsync(text, ct))
            {
                counts.Read++;
                if (!BroadcastFilter.Keeps(game.Headers, options))
                {
                    continue;
                }

                counts.Kept++;
                (IReadOnlyList<string> moves, string? error) = PgnReader.ToUci(game.San);
                if (error is not null)
                {
                    counts.Refused++;
                    continue;
                }

                batch.Add(BroadcastFilter.ToImport(game, moves));
                if (batch.Count >= options.BatchSize)
                {
                    await ImportAsync(runId, source, batch, counts, ct);
                }
            }

            await ImportAsync(runId, source, batch, counts, ct);
            await SaveAsync(runId, counts, LibraryImportRun.Finished, null, ct);
            Utils.Log.BroadcastImportFinished(logger, month, counts.Read, counts.Kept, counts.Imported, counts.Duplicate, counts.Refused);
        }
        catch (Exception e) when (e is HttpRequestException or IOException or ZstdSharp.ZstdException or OperationCanceledException
                                   or System.Data.Common.DbException or DbUpdateException or InvalidOperationException)
        {
            await FailAsync(runId, month, counts, e.Message, e, CancellationToken.None);
        }
    }

    public async Task MarkInterruptedAsync(CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        foreach (LibraryImportRun run in await db.LibraryImportRuns.Where(r => r.State == LibraryImportRun.Running).ToListAsync(ct))
        {
            run.State = LibraryImportRun.Failed;
            run.Error = "Interrupted (the node running it stopped); run the month again to finish it.";
            run.FinishedAt = clock.GetUtcNow();
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<LibraryImportRun>> RecentAsync(int limit, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        return await db.LibraryImportRuns.AsNoTracking().OrderByDescending(r => r.StartedAt).Take(limit).ToListAsync(ct);
    }

    /// <summary>One transaction per batch, in a scope of its own so the change tracker never grows with the month.</summary>
    private async Task ImportAsync(Guid runId, ImportSource source, List<ImportGame> batch, Counts counts, CancellationToken ct)
    {
        if (batch.Count == 0)
        {
            return;
        }

        await using (AsyncServiceScope scope = scopes.CreateAsyncScope())
        {
            IReadOnlyList<ImportItem> items = await scope.ServiceProvider.GetRequiredService<ILibraryService>().ImportAsync(source, batch, ct);
            counts.Imported += items.Count(i => i.Status == ImportStatus.Imported);
            counts.Duplicate += items.Count(i => i.Status == ImportStatus.Duplicate);
            counts.Refused += items.Count(i => i.Status == ImportStatus.Refused);
        }

        batch.Clear();
        await SaveAsync(runId, counts, LibraryImportRun.Running, null, ct);
    }

    private async Task FailAsync(Guid runId, string month, Counts counts, string reason, Exception? e, CancellationToken ct)
    {
        Utils.Log.BroadcastImportFailed(logger, e, month, reason);
        await SaveAsync(runId, counts, LibraryImportRun.Failed, reason.Length > 500 ? reason[..500] : reason, ct);
    }

    private async Task SaveAsync(Guid runId, Counts counts, string state, string? error, CancellationToken ct)
    {
        await using AsyncServiceScope scope = scopes.CreateAsyncScope();
        ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
        LibraryImportRun run = await db.LibraryImportRuns.SingleAsync(r => r.Id == runId, ct);
        (run.Read, run.Kept, run.Imported, run.Duplicate, run.Refused) = (counts.Read, counts.Kept, counts.Imported, counts.Duplicate, counts.Refused);
        run.State = state;
        run.Error = error;
        run.FinishedAt = state == LibraryImportRun.Running ? null : clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    private sealed class Counts
    {
        public int Read { get; set; }

        public int Kept { get; set; }

        public int Imported { get; set; }

        public int Duplicate { get; set; }

        public int Refused { get; set; }
    }
}

/// <summary>Start importing a month (<c>YYYY-MM</c>); answered <see cref="BroadcastImportStarted"/> or <see cref="BroadcastImportBusy"/>.</summary>
internal sealed record StartBroadcastImport(string Month);

internal sealed record BroadcastImportStarted(Guid RunId);

internal sealed record BroadcastImportBusy;

/// <summary>
/// The <c>library-importer</c> cluster singleton (broadcast-explorer D1): one month at a time across the cluster. It
/// persists nothing; the run's row is the record, and a run its node took down is marked failed when the singleton
/// starts again elsewhere.
/// </summary>
internal sealed class LibraryImporter : ReceiveActor
{
    /// <summary>The admin's request continues its trace; the import is a span of it.</summary>
    protected override bool AroundReceive(Receive receive, object message) =>
        ActorTracing.Receive(ActorNames.LibraryImporter, message, m => base.AroundReceive(receive, m));

    public const string SingletonName = ActorNames.LibraryImporter;

    private readonly IBroadcastImports _imports;
    private readonly ILoggingAdapter _log = Context.GetLogger();
    private bool _running;

    public LibraryImporter(IBroadcastImports imports)
    {
        _imports = imports;
        Receive<StartBroadcastImport>(start =>
        {
            if (_running)
            {
                Sender.Tell(new BroadcastImportBusy());
                return;
            }

            _running = true;
            IActorRef replyTo = Sender;
            _imports.CreateRunAsync(start.Month, CancellationToken.None).PipeTo(
                Self,
                success: id => new RunCreated(id, start.Month, replyTo),
                failure: e => new RunNotCreated(e, replyTo));
        });
        Receive<RunCreated>(created =>
        {
            created.ReplyTo.Tell(new BroadcastImportStarted(created.RunId));
            _imports.RunAsync(created.RunId, created.Month, CancellationToken.None).PipeTo(Self, success: () => RunDone.Instance, failure: _ => RunDone.Instance);
        });
        Receive<RunNotCreated>(failed =>
        {
            _running = false;
            _log.Warning(failed.Cause, "broadcast import run could not be created");
            failed.ReplyTo.Tell(new Status.Failure(failed.Cause));
        });
        Receive<RunDone>(_ => _running = false);
    }

    /// <summary>Busy until the runs a lost node left are marked failed, so a new run is never caught by that sweep.</summary>
    protected override void PreStart()
    {
        _running = true;
        _imports.MarkInterruptedAsync(CancellationToken.None).PipeTo(Self, success: () => RunDone.Instance, failure: _ => RunDone.Instance);
    }

    private sealed record RunCreated(Guid RunId, string Month, IActorRef ReplyTo);

    private sealed record RunNotCreated(Exception Cause, IActorRef ReplyTo);

    private sealed class RunDone
    {
        public static readonly RunDone Instance = new();
    }
}
