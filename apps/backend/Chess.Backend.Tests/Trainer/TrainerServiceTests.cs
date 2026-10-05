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

/// <summary>Drilling a member's own study (study-repertoire-trainer D6, D10).</summary>
public sealed class StudyTrainerTests
{
    private const long Me = 7;
    private const long Other = 8;
    private const string Start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private static Chess.Backend.Studies.StudyMoveInput M(string uci, params Chess.Backend.Studies.StudyMoveInput[] children) => new(uci, children);

    /// <summary>1.e4 e5 2.Nf3 (2.f4): two lines for White.</summary>
    private static async Task<(TrainerService Trainer, ProjectDbContext Db, FakeClock Clock, Guid StudyId)> Create(long owner = Me, bool shared = false)
    {
        string name = Guid.NewGuid().ToString("N");
        ProjectDbContext db = TestDb.Create(name: name);
        IReadOnlyList<Chess.Backend.Studies.StudyMove> tree = Chess.Backend.Studies.StudyTree.Validate(Start, [M("e2e4", M("e7e5", M("g1f3"), M("f2f4")))]).Tree!;
        Study study = new()
        {
            Id = Guid.NewGuid(),
            OwnerId = owner,
            Title = "My e4",
            StartFen = Start,
            Tree = System.Text.Json.JsonSerializer.Serialize(tree, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)),
            Shared = shared,
        };
        db.Studies.Add(study);
        await db.SaveChangesAsync();
        FakeClock clock = new(Time.Utc("2026-10-05T10:00:00Z"));
        ServiceProvider services = new ServiceCollection().AddScoped(_ => TestDb.Create(name: name)).BuildServiceProvider();
        TrainerService trainer = new(db, new OpeningFamiliesCache(services.GetRequiredService<IServiceScopeFactory>()), clock, NullLogger<TrainerService>.Instance);
        return (trainer, db, clock, study.Id);
    }

    [Fact]
    public async Task Only_the_owner_drills_a_study_even_a_shared_one()
    {
        (TrainerService trainer, ProjectDbContext db, _, Guid id) = await Create(owner: Other, shared: true);
        using (db)
        {
            Assert.Null(await trainer.StudyAsync(Me, id, "white", CancellationToken.None));
            Assert.Null(await trainer.StudyNextAsync(Me, id, "white", CancellationToken.None));
        }
    }

    [Fact]
    public async Task A_study_drills_line_by_line_and_a_missed_line_comes_back_first()
    {
        (TrainerService trainer, ProjectDbContext db, FakeClock clock, Guid id) = await Create();
        using (db)
        {
            StudyDrill drill = (await trainer.StudyAsync(Me, id, "white", CancellationToken.None))!;
            Assert.Equal(("My e4", Start, 2), (drill.Title, drill.StartFen, drill.Lines.Count));
            Assert.All(drill.Lines, l => Assert.Null(l.Box));

            (StudyLineProgress? first, _) = (await trainer.StudyNextAsync(Me, id, "white", CancellationToken.None))!.Value;
            Assert.Equal(["e2e4", "e7e5", "g1f3"], first!.Moves);
            await trainer.RecordStudyAsync(Me, id, first.Key, "white", mistakes: 0, CancellationToken.None);
            (StudyLineProgress? second, _) = (await trainer.StudyNextAsync(Me, id, "white", CancellationToken.None))!.Value;
            Assert.Equal(["e2e4", "e7e5", "f2f4"], second!.Moves);
            RunResult missed = (await trainer.RecordStudyAsync(Me, id, second.Key, "white", mistakes: 2, CancellationToken.None))!;
            Assert.Equal(0, missed.Box);

            (StudyLineProgress? again, _) = (await trainer.StudyNextAsync(Me, id, "white", CancellationToken.None))!.Value;
            Assert.Equal(second.Key, again!.Key);
            Assert.Equal(id, (await db.TrainerProgress.SingleAsync(p => p.LineKey == first.Key)).StudyId);
        }
    }

    [Fact]
    public async Task A_result_for_a_line_the_study_does_not_have_is_refused()
    {
        (TrainerService trainer, ProjectDbContext db, _, Guid id) = await Create();
        using (db)
        {
            Assert.Null(await trainer.RecordStudyAsync(Me, id, "study:not-a-line", "white", 0, CancellationToken.None));
            Assert.Null(await trainer.RecordStudyAsync(Other, id, "study:x", "white", 0, CancellationToken.None));
            Assert.Empty(db.TrainerProgress);
        }
    }

    [Fact]
    public async Task The_studies_list_counts_lines_and_learned_ones_per_side()
    {
        (TrainerService trainer, ProjectDbContext db, _, Guid id) = await Create();
        using (db)
        {
            StudyLineProgress line = (await trainer.StudyAsync(Me, id, "white", CancellationToken.None))!.Lines[0];
            for (int i = 0; i < TrainerSchedule.LearnedBox; i++)
            {
                await trainer.RecordStudyAsync(Me, id, line.Key, "white", 0, CancellationToken.None);
            }

            StudyTraining white = Assert.Single((await trainer.StudiesAsync(Me, "white", null, 20, CancellationToken.None)).Items);
            StudyTraining black = Assert.Single((await trainer.StudiesAsync(Me, "black", null, 20, CancellationToken.None)).Items);

            Assert.Equal((id, 2, 1), (white.Id, white.Lines, white.Learned));
            Assert.Equal((2, 0), (black.Lines, black.Learned)); // both paths have 1...e5, then White replies two ways
            Assert.Empty(await trainer.MineAsync(Me, CancellationToken.None)); // named openings only
        }
    }
}
