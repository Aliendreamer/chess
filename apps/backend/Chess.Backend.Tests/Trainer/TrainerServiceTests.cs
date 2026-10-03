using Chess.Backend.Library;
using Chess.Backend.Trainer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Chess.Backend.Tests.Trainer;

public sealed class TrainerServiceTests
{
    private const long Me = 7;

    private static (TrainerService Service, FakeClock Clock, ServiceProvider Services) Create()
    {
        string database = Guid.NewGuid().ToString("N");
        ServiceProvider services = new ServiceCollection()
            .AddDbContext<ProjectDbContext>(o => o.UseInMemoryDatabase(database))
            .BuildServiceProvider();
        using (IServiceScope scope = services.CreateScope())
        {
            ProjectDbContext seed = scope.ServiceProvider.GetRequiredService<ProjectDbContext>();
            seed.Openings.AddRange(
                OpeningSeed.Parse("C65", "Ruy Lopez: Berlin Defense", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6")!,
                OpeningSeed.Parse("C70", "Ruy Lopez: Morphy Defense", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6")!,
                OpeningSeed.Parse("B20", "Sicilian Defense", "1. e4 c5")!);
            seed.SaveChanges();
        }

        FakeClock clock = new(Time.Utc("2026-10-03T10:00:00Z"));
        ProjectDbContext db = services.CreateScope().ServiceProvider.GetRequiredService<ProjectDbContext>();
        return (new TrainerService(db, new OpeningFamiliesCache(services.GetRequiredService<IServiceScopeFactory>()), clock, NullLogger<TrainerService>.Instance), clock, services);
    }

    [Fact]
    public async Task A_missed_line_comes_back_first_and_a_known_line_waits()
    {
        (TrainerService trainer, FakeClock clock, ServiceProvider _) = Create();

        (LineProgress? first, _) = (await trainer.NextAsync(Me, "Ruy Lopez", "black", CancellationToken.None))!.Value;
        Assert.Equal("Ruy Lopez: Berlin Defense", first!.Name);

        await trainer.RecordAsync(Me, first.Key, "black", mistakes: 0, CancellationToken.None);
        (LineProgress? second, _) = (await trainer.NextAsync(Me, "Ruy Lopez", "black", CancellationToken.None))!.Value;
        Assert.Equal("Ruy Lopez: Morphy Defense", second!.Name); // the Berlin is known for a day

        await trainer.RecordAsync(Me, second.Key, "black", mistakes: 2, CancellationToken.None);
        clock.Advance(TimeSpan.FromMinutes(1));
        (LineProgress? third, _) = (await trainer.NextAsync(Me, "Ruy Lopez", "black", CancellationToken.None))!.Value;
        Assert.Equal(("Ruy Lopez: Morphy Defense", 0), (third!.Name, third.Box)); // missed: back at once
    }

    [Fact]
    public async Task Three_clean_runs_learn_a_line_and_the_families_count_it()
    {
        (TrainerService trainer, FakeClock clock, ServiceProvider _) = Create();
        string key = (await trainer.FamilyAsync(Me, "Sicilian Defense", "white", CancellationToken.None))![0].Key;

        RunResult? last = null;
        for (int run = 0; run < 3; run++)
        {
            last = await trainer.RecordAsync(Me, key, "white", 0, CancellationToken.None);
            clock.Advance(TimeSpan.FromDays(10));
        }

        Assert.True(last!.Learned);
        FamilyProgress sicilian = Assert.Single(await trainer.FamiliesAsync(Me, "sicil", "white", CancellationToken.None));
        Assert.Equal((1, 1), (sicilian.Lines, sicilian.Learned));
        Assert.Equal(0, Assert.Single(await trainer.FamiliesAsync(Me, "sicil", "black", CancellationToken.None)).Learned);
        Assert.Equal([new TrainedFamily("Sicilian Defense", "white", 1, 1)], await trainer.MineAsync(Me, CancellationToken.None));
    }

    [Fact]
    public async Task Nothing_due_says_when_and_unknown_names_or_lines_are_null()
    {
        (TrainerService trainer, FakeClock _, ServiceProvider _) = Create();
        string key = (await trainer.FamilyAsync(Me, "Sicilian Defense", "white", CancellationToken.None))![0].Key;
        await trainer.RecordAsync(Me, key, "white", 0, CancellationToken.None);

        (LineProgress? line, DateTimeOffset? next) = (await trainer.NextAsync(Me, "Sicilian Defense", "white", CancellationToken.None))!.Value;

        Assert.Null(line);
        Assert.Equal(Time.Utc("2026-10-04T10:00:00Z"), next);
        Assert.Null(await trainer.FamilyAsync(Me, "No Such Opening", "white", CancellationToken.None));
        Assert.Null(await trainer.RecordAsync(Me, "not a line", "white", 0, CancellationToken.None));
    }
}
