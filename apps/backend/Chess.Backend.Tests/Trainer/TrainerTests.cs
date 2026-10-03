using Chess.Backend.Library;
using Chess.Backend.Trainer;

namespace Chess.Backend.Tests.Trainer;

public sealed class OpeningFamiliesTests
{
    private static Opening Line(string name, string pgn) => OpeningSeed.Parse("C60", name, pgn)!;

    private static readonly List<Opening> Openings =
    [
        Line("Ruy Lopez", "1. e4 e5 2. Nf3 Nc6 3. Bb5"),
        Line("Ruy Lopez: Berlin Defense", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6"),
        Line("Ruy Lopez: Berlin Defense, Rio Gambit Accepted", "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4"),
        Line("Ruy Lopez: Morphy Defense", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"),
        Line("Sicilian Defense", "1. e4 c5"),
        Line("Sicilian Defense: Najdorf Variation", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"),
    ];

    [Fact]
    public void Families_are_the_names_before_the_colon_with_their_leaf_lines()
    {
        OpeningFamilies families = new(Openings);

        Assert.Equal([("Ruy Lopez", 2), ("Sicilian Defense", 1)], families.Families().Select(f => (f.Name, f.Lines)));
    }

    [Fact]
    public void A_family_drills_only_the_lines_no_other_line_extends()
    {
        OpeningFamilies families = new(Openings);

        Assert.Equal(
            ["Ruy Lopez: Berlin Defense, Rio Gambit Accepted", "Ruy Lopez: Morphy Defense"],
            families.Lines("Ruy Lopez").Select(l => l.Name));
        Assert.Equal(["Ruy Lopez: Berlin Defense, Rio Gambit Accepted"], families.Lines("Ruy Lopez: Berlin Defense").Select(l => l.Name));
        Assert.Empty(families.Lines("Ruy Lopez: Berl")); // a prefix must end at a name boundary
    }

    [Fact]
    public void Search_finds_families_and_variations_by_part_of_a_name()
    {
        OpeningFamilies families = new(Openings);

        Assert.Equal(["Sicilian Defense: Najdorf Variation"], families.Search("najdorf").Select(f => f.Name));
        Assert.Equal(["Ruy Lopez", "Ruy Lopez: Berlin Defense", "Ruy Lopez: Morphy Defense"], families.Search("ruy").Select(f => f.Name));
    }
}

public sealed class TrainerScheduleTests
{
    private static readonly DateTimeOffset Now = Time.Utc("2026-10-03T10:00:00Z");

    [Fact]
    public void A_clean_run_moves_a_line_up_one_box_and_spaces_it_out()
    {
        (int box, DateTimeOffset due) = TrainerSchedule.After(null, clean: true, Now);
        Assert.Equal((1, Now.AddDays(1)), (box, due));
        Assert.Equal((2, Now.AddDays(3)), TrainerSchedule.After(1, clean: true, Now));
        Assert.Equal((3, Now.AddDays(7)), TrainerSchedule.After(2, clean: true, Now));
        Assert.Equal((5, Now.AddDays(30)), TrainerSchedule.After(5, clean: true, Now));
    }

    [Fact]
    public void A_mistake_sends_the_line_back_to_the_start_due_at_once()
    {
        Assert.Equal((0, Now), TrainerSchedule.After(4, clean: false, Now));
    }

    [Fact]
    public void The_next_line_is_the_lowest_box_due_then_the_oldest_due_then_a_new_one()
    {
        string[] tree = ["a", "b", "c", "d"];
        Dictionary<string, (int Box, DateTimeOffset Due)> progress = new(StringComparer.Ordinal)
        {
            ["a"] = (2, Now.AddMinutes(-5)),
            ["b"] = (0, Now.AddMinutes(-1)),
            ["c"] = (0, Now.AddMinutes(-9)),
        };

        Assert.Equal("c", TrainerSchedule.Next(tree, progress, Now).Line);
        progress["c"] = (1, Now.AddDays(1)); // trained, not due
        Assert.Equal("b", TrainerSchedule.Next(tree, progress, Now).Line);
        progress["b"] = (1, Now.AddDays(1));
        progress["a"] = (3, Now.AddDays(7));
        Assert.Equal("d", TrainerSchedule.Next(tree, progress, Now).Line); // nothing due: the first new line
    }

    [Fact]
    public void A_family_with_nothing_due_says_when_the_next_line_is()
    {
        Dictionary<string, (int Box, DateTimeOffset Due)> progress = new(StringComparer.Ordinal)
        {
            ["a"] = (3, Now.AddDays(7)),
            ["b"] = (1, Now.AddDays(1)),
        };

        NextLine next = TrainerSchedule.Next(["a", "b"], progress, Now);

        Assert.Equal((null, Now.AddDays(1)), (next.Line, next.NextDueAt));
    }

    [Fact]
    public void A_line_is_learned_from_box_three()
    {
        Assert.Equal([false, false, false, true, true, true], Enumerable.Range(0, 6).Select(TrainerSchedule.Learned));
    }
}
