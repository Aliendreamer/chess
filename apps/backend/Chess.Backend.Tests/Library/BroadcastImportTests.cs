using System.Net;
using System.Text;
using Akka.Actor;
using Akka.TestKit.Xunit2;
using Chess.Backend.Library;
using Microsoft.Extensions.DependencyInjection;
using ZstdSharp;

namespace Chess.Backend.Tests.Library;

/// <summary>A month's import (broadcast-explorer D1) over a fake lichess and the in-memory database.</summary>
public sealed class BroadcastImportsTests
{
    private static string Game(string white, string whiteElo, string moves, string result = "1-0", string tc = "90+30") => $"""
        [Event "Round 1: {white} - X"]
        [White "{white}"]
        [Black "X"]
        [Result "{result}"]
        [WhiteElo "{whiteElo}"]
        [BlackElo "2500"]
        [TimeControl "{tc}"]
        [BroadcastName "Synthetic Open"]
        [GameURL "https://lichess.org/broadcast/s/r/{white}"]

        {moves} {result}


        """;

    /// <summary>Five games: three kept and legal, one kept but illegal, one too weak, one blitz.</summary>
    private static readonly string Month =
        Game("A", "2600", "1. e4 e5 2. Nf3 Nc6")
        + Game("B", "2600", "1. d4 d5 2. c4 e6")
        + Game("C", "2600", "1. c4 e5")
        + Game("D", "2600", "1. e4 e5 2. Ke3")
        + Game("E", "2100", "1. e4 c5")
        + Game("F", "2600", "1. e4 c6", tc: "3+2");

    private sealed class FakeLichess(HttpStatusCode status, byte[] body) : HttpMessageHandler
    {
        public List<Uri> Asked { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Asked.Add(request.RequestUri!);
            return Task.FromResult(new HttpResponseMessage(status) { Content = new ByteArrayContent(body) });
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (BroadcastImports Imports, ServiceProvider Services, FakeLichess Lichess) Build(HttpStatusCode status = HttpStatusCode.OK)
    {
        using Compressor compressor = new(3);
        FakeLichess lichess = new(status, compressor.Wrap(Encoding.UTF8.GetBytes(Month)).ToArray());
        string db = Guid.NewGuid().ToString("N");
        ServiceCollection services = new();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped(_ => TestDb.Create(name: db));
        services.AddFusionCache();
        services.AddScoped<ILibraryService, LibraryService>();
        ServiceProvider provider = services.BuildServiceProvider();
        LibraryBroadcastsOptions options = new() { BatchSize = 2 };
        BroadcastImports imports = new(new Factory(lichess), provider.GetRequiredService<IServiceScopeFactory>(), options, TimeProvider.System, NullLogger<BroadcastImports>.Instance);
        return (imports, provider, lichess);
    }

    private static async Task<LibraryImportRun> Run(BroadcastImports imports, string month = "2026-08")
    {
        Guid id = await imports.CreateRunAsync(month, CancellationToken.None);
        await imports.RunAsync(id, month, CancellationToken.None);
        return Assert.Single(await imports.RecentAsync(10, CancellationToken.None), r => r.Id == id);
    }

    [Fact]
    public async Task A_month_is_streamed_filtered_and_imported_with_its_counts()
    {
        (BroadcastImports imports, ServiceProvider services, FakeLichess lichess) = Build();
        await using (services)
        {
            LibraryImportRun run = await Run(imports);

            Assert.Equal((LibraryImportRun.Finished, 6, 4, 3, 0, 1), (run.State, run.Read, run.Kept, run.Imported, run.Duplicate, run.Refused));
            Assert.Equal(new Uri("https://database.lichess.org/broadcast/lichess_db_broadcast_2026-08.pgn.zst"), Assert.Single(lichess.Asked));
            await using AsyncServiceScope scope = services.CreateAsyncScope();
            ProjectDbContext db = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
            LibraryGame a = await db.LibraryGames.SingleAsync(g => g.White == "A");
            Assert.Equal(("Synthetic Open", "lichess broadcasts", "CC BY-SA 4.0", "https://lichess.org/broadcast/s/r/A", false),
                (a.Event, a.Source, a.Licence, a.SourceRef, a.WorldChampionship));
        }
    }

    [Fact]
    public async Task Running_the_same_month_again_adds_nothing()
    {
        (BroadcastImports imports, ServiceProvider services, _) = Build();
        await using (services)
        {
            await Run(imports);
            LibraryImportRun again = await Run(imports);

            Assert.Equal((0, 3), (again.Imported, again.Duplicate));
        }
    }

    [Fact]
    public async Task A_refused_download_ends_the_run_failed_with_the_status()
    {
        (BroadcastImports imports, ServiceProvider services, _) = Build(HttpStatusCode.NotFound);
        await using (services)
        {
            LibraryImportRun run = await Run(imports);

            Assert.Equal(LibraryImportRun.Failed, run.State);
            Assert.Contains("404", run.Error, StringComparison.Ordinal);
            Assert.NotNull(run.FinishedAt);
        }
    }

    [Fact]
    public async Task Runs_a_lost_node_left_running_are_marked_failed()
    {
        (BroadcastImports imports, ServiceProvider services, _) = Build();
        await using (services)
        {
            Guid id = await imports.CreateRunAsync("2026-08", CancellationToken.None);

            await imports.MarkInterruptedAsync(CancellationToken.None);

            Assert.Equal(LibraryImportRun.Failed, (await imports.RecentAsync(1, CancellationToken.None)).Single(r => r.Id == id).State);
        }
    }

    [Fact]
    public void The_url_is_built_from_a_month_only()
    {
        (BroadcastImports imports, ServiceProvider services, _) = Build();
        using (services)
        {
            Assert.Throws<ArgumentException>(() => imports.UrlOf("2026-08/../../x"));
            Assert.Throws<ArgumentException>(() => imports.UrlOf("2026-13"));
        }
    }
}

/// <summary>The <c>library-importer</c> singleton: one month at a time.</summary>
public sealed class LibraryImporterTests : TestKit
{
    private sealed class FakeImports : IBroadcastImports
    {
        public TaskCompletionSource Running { get; } = new();

        public int Interrupted { get; private set; }

        public Task<Guid> CreateRunAsync(string month, CancellationToken ct) => Task.FromResult(Guid.CreateVersion7());

        public Task RunAsync(Guid runId, string month, CancellationToken ct) => Running.Task;

        public Task MarkInterruptedAsync(CancellationToken ct)
        {
            Interrupted++;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<LibraryImportRun>> RecentAsync(int limit, CancellationToken ct) => Task.FromResult<IReadOnlyList<LibraryImportRun>>([]);
    }

    [Fact]
    public void A_second_month_waits_until_the_first_is_done()
    {
        FakeImports imports = new();
        IActorRef importer = Sys.ActorOf(Props.Create(() => new LibraryImporter(imports)));
        AwaitCondition(() => imports.Interrupted == 1);
        AwaitAssert(() =>
        {
            importer.Tell(new StartBroadcastImport("2026-08"));
            ExpectMsg<BroadcastImportStarted>();
        });

        importer.Tell(new StartBroadcastImport("2026-07"));
        ExpectMsg<BroadcastImportBusy>();

        imports.Running.SetResult();
        AwaitAssert(() =>
        {
            importer.Tell(new StartBroadcastImport("2026-07"));
            ExpectMsg<BroadcastImportStarted>(TimeSpan.FromMilliseconds(200));
        });
    }
}
