using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Chess.Backend.Studies;
using Microsoft.AspNetCore.Http;

namespace Chess.Backend.Tests.Studies;

public sealed class StudyServiceTests
{
    private const long Ann = 1;
    private const long Bob = 2;

    private static StudyMoveInput M(string uci, params StudyMoveInput[] children) => new(uci, children);

    private static (ProjectDbContext Db, StudyService Service) Build(FakeClock? clock = null)
    {
        ProjectDbContext db = TestDb.Create(clock);
        db.Users.AddRange(new User { Id = Ann, Sub = "a", Username = "ann" }, new User { Id = Bob, Sub = "b", Username = "bob" });
        db.SaveChanges();
        return (db, new StudyService(db, NullLogger<StudyService>.Instance));
    }

    private static async Task<StudyView> CreatedAsync(StudyService service, long owner = Ann, string title = "Ruy")
    {
        ImportResult result = (await service.CreateAsync(owner, [new StudyInput(title, null, [M("e2e4", M("e7e5"))])], CancellationToken.None)).Value!;
        return (await service.GetAsync(result.Created[0].Id, owner, CancellationToken.None)).Value!;
    }

    [Fact]
    public async Task An_import_creates_the_good_studies_and_names_the_bad_ones()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            ImportResult result = (await service.CreateAsync(Ann,
            [
                new StudyInput("One", null, [M("e2e4")]),
                new StudyInput("Two", null, [M("e2e5")]),
                new StudyInput("Three", "8/8/8/4k3/8/8/4P3/4K3 w - - 0 40", [M("e2e4")], "ann", "bob", "1-0", "2026.09.28"),
            ], CancellationToken.None)).Value!;

            Assert.Equal(["One", "Three"], result.Created.Select(s => s.Title));
            Assert.Equal(1, Assert.Single(result.Refused).Index);
            Assert.Equal(ChessRules.StartFen, (await db.Studies.SingleAsync(s => s.Title == "One")).StartFen);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(21)]
    public async Task An_import_holds_one_to_twenty_studies(int count)
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            StudyInput[] many = [.. Enumerable.Range(0, count).Select(i => new StudyInput($"s{i}", null, []))];

            Assert.Equal(StatusCodes.Status400BadRequest, (await service.CreateAsync(Ann, many, CancellationToken.None)).Status);
        }
    }

    [Fact]
    public async Task A_private_study_does_not_exist_for_others_until_it_is_shared()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            StudyView study = await CreatedAsync(service);

            Assert.Equal(StatusCodes.Status404NotFound, (await service.GetAsync(study.Id, Bob, CancellationToken.None)).Status);
            Assert.Equal(StatusCodes.Status404NotFound, (await service.ShareAsync(study.Id, Bob, true, CancellationToken.None)).Status);

            await service.ShareAsync(study.Id, Ann, true, CancellationToken.None);
            StudyView seen = (await service.GetAsync(study.Id, Bob, CancellationToken.None)).Value!;
            Assert.Equal((false, "ann", "e4"), (seen.Mine, seen.OwnerName, seen.Tree[0].San));
            Assert.Equal(StatusCodes.Status404NotFound, (await service.UpdateAsync(study.Id, Bob, "mine now", [], seen.Version, CancellationToken.None)).Status);
        }
    }

    [Fact]
    public async Task A_save_replaces_the_tree_and_a_stale_version_is_a_conflict()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            StudyView study = await CreatedAsync(service);

            StudyView saved = (await service.UpdateAsync(study.Id, Ann, "Ruy, with d6", [M("e2e4", M("e7e5"), M("d7d6"))], study.Version, CancellationToken.None)).Value!;
            StudyOutcome<StudyView> stale = await service.UpdateAsync(study.Id, Ann, "again", [], study.Version, CancellationToken.None);

            Assert.Equal(("Ruy, with d6", "d6"), (saved.Title, saved.Tree[0].Children[1].San));
            Assert.True(saved.Version > study.Version);
            Assert.Equal(StatusCodes.Status409Conflict, stale.Status);
        }
    }

    [Fact]
    public async Task An_illegal_save_is_refused_and_changes_nothing()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            StudyView study = await CreatedAsync(service);

            StudyOutcome<StudyView> refused = await service.UpdateAsync(study.Id, Ann, "Ruy", [M("e2e4", M("e1e3"))], study.Version, CancellationToken.None);

            Assert.Equal(StatusCodes.Status400BadRequest, refused.Status);
            Assert.Contains("e1e3", refused.Error, StringComparison.Ordinal);
            Assert.Equal("e5", (await service.GetAsync(study.Id, Ann, CancellationToken.None)).Value!.Tree[0].Children[0].San);
        }
    }

    [Fact]
    public async Task Only_the_owner_deletes_and_the_pgn_follows_access()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            StudyView study = await CreatedAsync(service, title: "To go");

            Assert.Equal(StatusCodes.Status404NotFound, (await service.PgnAsync(study.Id, Bob, CancellationToken.None)).Status);
            Assert.Contains("1. e4 e5 *", (await service.PgnAsync(study.Id, Ann, CancellationToken.None)).Value, StringComparison.Ordinal);
            Assert.False(await service.DeleteAsync(study.Id, Bob, CancellationToken.None));
            Assert.True(await service.DeleteAsync(study.Id, Ann, CancellationToken.None));
            Assert.Equal(StatusCodes.Status404NotFound, (await service.GetAsync(study.Id, Ann, CancellationToken.None)).Status);
        }
    }

    [Fact]
    public async Task My_studies_are_mine_newest_first()
    {
        // The studies' times come from the clock the test moves: two creations in one tick of the real clock would fall
        // back to their random ids for the order, and fail now and then.
        FakeClock clock = new(Time.Utc("2026-09-28T10:00:00Z"));
        (ProjectDbContext db, StudyService service) = Build(clock);
        using (db)
        {
            await CreatedAsync(service, title: "first");
            clock.Advance(TimeSpan.FromSeconds(1));
            await CreatedAsync(service, owner: Bob, title: "bob's");
            clock.Advance(TimeSpan.FromSeconds(1));
            await CreatedAsync(service, title: "second");

            CursorPage<StudyListItem> page = await service.MineAsync(Ann, null, 10, CancellationToken.None);

            Assert.Equal(["second", "first"], page.Items.Select(s => s.Title));
        }
    }

    [Fact]
    public async Task A_finished_game_becomes_a_study_with_its_moves_and_players()
    {
        (ProjectDbContext db, StudyService service) = Build();
        using (db)
        {
            Guid game = Guid.CreateVersion7();
            DateTimeOffset at = Time.Utc("2026-09-27T10:00:00Z");
            db.RmGames.Add(new RmGame
            {
                GameId = game,
                WhiteId = Ann,
                WhiteName = "ann",
                BlackId = Bob,
                BlackName = "bob",
                TimeControl = "5+3",
                Status = RmGame.Ended,
                Result = "0-1",
                Reason = "Checkmate",
                Ply = 4,
                LastFen = "x",
                CreatedAt = at,
                UpdatedAt = at,
            });
            string[] moves = ["f2f3", "e7e5", "g2g4", "d8h4"];
            for (int i = 0; i < moves.Length; i++)
            {
                db.RmMoves.Add(new RmMove { GameId = game, Ply = i + 1, Uci = moves[i], San = "?", FenAfter = "x", At = at });
            }

            await db.SaveChangesAsync();

            StudyView study = (await service.FromGameAsync(game, Bob, CancellationToken.None)).Value!;

            Assert.Equal(("ann – bob, 2026.09.27", Bob, "0-1"), (study.Title, study.OwnerId, study.Result));
            Assert.Equal(["f3", "e5", "g4", "Qh4#"], StudyTree.MainLine(study.Tree).Select(m => m.San));
            Assert.Equal(StatusCodes.Status404NotFound, (await service.FromGameAsync(Guid.CreateVersion7(), Bob, CancellationToken.None)).Status);
        }
    }
}
