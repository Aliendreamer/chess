using Chess.Backend.Games;

namespace Chess.Backend.Tests.Games;

public sealed class TimeControlTests
{
    [Fact]
    public void Presets_are_the_d12_list_in_order() =>
        Assert.Equal(
            ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+20", "90+30"],
            TimeControl.Presets.Select(tc => tc.ToString()));

    [Fact]
    public void Parses_minutes_and_increment_seconds_into_milliseconds()
    {
        Assert.True(TimeControl.TryParse("5+3", out TimeControl tc));
        Assert.Equal((300_000L, 3_000L), (tc.InitialMs, tc.IncrementMs));
    }

    [Theory]
    [InlineData("4+2")] // not a preset
    [InlineData("5")]
    [InlineData("5+")]
    [InlineData("+3")]
    [InlineData("five+three")]
    [InlineData("")]
    [InlineData(null)]
    public void Only_presets_parse(string? text) => Assert.False(TimeControl.TryParse(text, out _));

    [Theory]
    [InlineData("1+0", "Bullet")]
    [InlineData("2+1", "Bullet")]
    [InlineData("3+2", "Blitz")]
    [InlineData("10+5", "Rapid")]
    [InlineData("90+30", "Classical")]
    public void Each_preset_has_its_category(string text, string category)
    {
        Assert.True(TimeControl.TryParse(text, out TimeControl tc));
        Assert.Equal(category, tc.Category.ToString());
    }

    [Fact]
    public void Untimed_is_not_a_preset_but_a_game_may_carry_it()
    {
        Assert.Equal(("untimed", 0L, 0L, true), (TimeControl.Untimed.ToString(), TimeControl.Untimed.InitialMs, TimeControl.Untimed.IncrementMs, TimeControl.Untimed.IsUntimed));
        Assert.False(TimeControl.TryParse("untimed", out _)); // the queue and invites never see it
        Assert.True(TimeControl.TryParseAny("untimed", out TimeControl tc));
        Assert.Equal(TimeControl.Untimed, tc);
        Assert.True(TimeControl.TryParseAny("5+3", out _));
        Assert.DoesNotContain(TimeControl.Presets, p => p.IsUntimed);
    }

    [Fact]
    public void Only_untimed_games_passivate_while_playing()
    {
        TimeSpan idle = TimeSpan.FromMinutes(30);

        Assert.Equal(new PassivationPolicy(idle, TimeSpan.FromMinutes(1)), PassivationPolicy.For(TimeControl.Untimed, idle));
        Assert.Null(PassivationPolicy.For(TimeControl.Presets[0], idle).WhilePlaying);
    }
}
