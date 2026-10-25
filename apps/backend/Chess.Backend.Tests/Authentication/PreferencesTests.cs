using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Me;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Tests.Authentication;

/// <summary>Display preferences on the account (user-preferences): allowed values, defaults, and the cached read.</summary>
public sealed class PreferencesTests
{
    private static PreferencesService Build(ProjectDbContext db, IFusionCache? cache = null) =>
        new(db, cache ?? new FusionCache(new FusionCacheOptions()), Options.Create(new CacheOptions()), NullLogger<PreferencesService>.Instance);

    private static async Task<long> UserAsync(ProjectDbContext db, string? stored = null)
    {
        User user = new() { Sub = Guid.NewGuid().ToString("N"), Preferences = stored };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    [Fact]
    public void The_defaults_are_brown_cburnett_normal_with_coordinates_on_dark() =>
        Assert.Equal(new Preferences("brown", "cburnett", "normal", true, "dark"), Preferences.Default);

    [Fact]
    public void The_engine_is_shown_on_the_analysis_board_and_hidden_while_playing_by_default() =>
        Assert.Equal(
            (true, true, false, false),
            (Preferences.Default.AnalysisBar, Preferences.Default.AnalysisLines, Preferences.Default.PlayBar, Preferences.Default.PlayLines));

    [Fact]
    public void The_defaults_are_allowed() => Assert.Null(Preferences.Default.Problem());

    [Fact]
    public void The_light_site_theme_is_allowed() => Assert.Null((Preferences.Default with { SiteTheme = "light" }).Problem());

    [Theory]
    [InlineData("neon", "cburnett", "normal", "dark", "boardTheme")]
    [InlineData("brown", "alpha", "normal", "dark", "pieceSet")]
    [InlineData("brown", "cburnett", "slow", "dark", "animation")]
    [InlineData("brown", "cburnett", "normal", "pink", "siteTheme")]
    public void An_unknown_value_names_its_field(string board, string pieces, string animation, string site, string field) =>
        Assert.Contains(field, new Preferences(board, pieces, animation, true, site).Problem(), StringComparison.Ordinal);

    [Fact]
    public async Task A_user_who_never_chose_gets_the_defaults()
    {
        using ProjectDbContext db = TestDb.Create();
        long id = await UserAsync(db);

        Assert.Equal(Preferences.Default, await Build(db).GetAsync(id, CancellationToken.None));
    }

    [Fact]
    public async Task A_saved_choice_is_read_back_even_through_the_cache()
    {
        using ProjectDbContext db = TestDb.Create();
        long id = await UserAsync(db);
        PreferencesService svc = Build(db);
        Assert.Equal(Preferences.Default, await svc.GetAsync(id, CancellationToken.None)); // now cached

        Preferences blue = Preferences.Default with { BoardTheme = "blue", Coordinates = false };
        Assert.Equal(blue, await svc.SetAsync(id, blue, CancellationToken.None));

        Assert.Equal(blue, await svc.GetAsync(id, CancellationToken.None));
    }

    [Fact]
    public async Task The_evaluation_switches_are_saved_and_read_back()
    {
        using ProjectDbContext db = TestDb.Create();
        long id = await UserAsync(db);
        Preferences shown = Preferences.Default with { AnalysisLines = false, PlayBar = true };

        await Build(db).SetAsync(id, shown, CancellationToken.None);

        Assert.Equal(shown, await Build(db).GetAsync(id, CancellationToken.None));
    }

    [Fact]
    public async Task An_unknown_value_is_refused_and_nothing_changes()
    {
        using ProjectDbContext db = TestDb.Create();
        long id = await UserAsync(db);
        PreferencesService svc = Build(db);

        Assert.Null(await svc.SetAsync(id, Preferences.Default with { BoardTheme = "neon" }, CancellationToken.None));

        Assert.Equal(Preferences.Default, await svc.GetAsync(id, CancellationToken.None));
        Assert.Null((await db.Users.SingleAsync()).Preferences);
    }

    [Fact]
    public async Task A_stored_value_no_longer_offered_falls_back_to_its_default()
    {
        using ProjectDbContext db = TestDb.Create();
        long id = await UserAsync(db, """{"boardTheme":"marble","pieceSet":"cburnett","animation":"fast","coordinates":false,"siteTheme":"dark"}""");

        Preferences read = await Build(db).GetAsync(id, CancellationToken.None);

        Assert.Equal(Preferences.Default with { Animation = "fast", Coordinates = false }, read);
    }
}

public sealed class PutPreferencesRequestValidatorTests
{
    private static PutPreferencesRequest Request(string board = "brown") =>
        new() { BoardTheme = board, PieceSet = "cburnett", Animation = "normal", Coordinates = true, SiteTheme = "dark" };

    [Fact]
    public void Allowed_values_pass() =>
        Assert.True(new PutPreferencesRequestValidator().Validate(Request()).IsValid);

    [Fact]
    public void A_request_without_the_evaluation_switches_keeps_their_defaults() =>
        Assert.Equal(Preferences.Default, Request().ToPreferences());

    [Fact]
    public void A_request_sets_each_evaluation_switch()
    {
        PutPreferencesRequest request = new()
        {
            BoardTheme = "brown",
            PieceSet = "cburnett",
            Animation = "normal",
            Coordinates = true,
            SiteTheme = "dark",
            AnalysisBar = false,
            AnalysisLines = false,
            PlayBar = true,
            PlayLines = true,
        };

        Assert.Equal(
            Preferences.Default with { AnalysisBar = false, AnalysisLines = false, PlayBar = true, PlayLines = true },
            request.ToPreferences());
    }

    [Fact]
    public void An_unknown_theme_is_a_400_naming_the_field()
    {
        FluentValidation.Results.ValidationResult result = new PutPreferencesRequestValidator().Validate(Request("neon"));

        Assert.False(result.IsValid);
        Assert.Contains("boardTheme", Assert.Single(result.Errors).ErrorMessage, StringComparison.Ordinal);
    }
}
