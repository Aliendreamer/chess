using System.Text.Json;
using Chess.Backend.Extensions;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Authentication;

/// <summary>
/// A user's display preferences (user-preferences): board theme, piece set, piece animation, coordinates and site
/// theme. Stored on <c>users.preferences</c> (jsonb, null = <see cref="Default"/>); the BFF reads them with every page so
/// the first paint already uses them.
/// </summary>
internal sealed record Preferences(string BoardTheme, string PieceSet, string Animation, bool Coordinates, string SiteTheme)
{
    public static readonly Preferences Default = new("brown", "cburnett", "normal", true, "dark");

    public static readonly IReadOnlyList<string> BoardThemes = ["brown", "blue", "green", "slate", "walnut"];

    public static readonly IReadOnlyList<string> PieceSets = ["cburnett"];

    public static readonly IReadOnlyList<string> Animations = ["off", "fast", "normal"];

    public static readonly IReadOnlyList<string> SiteThemes = ["dark"];

    /// <summary>What is wrong with these preferences, naming the field; null when every value is allowed.</summary>
    public string? Problem() =>
        !BoardThemes.Contains(BoardTheme) ? Unknown("boardTheme", BoardThemes)
        : !PieceSets.Contains(PieceSet) ? Unknown("pieceSet", PieceSets)
        : !Animations.Contains(Animation) ? Unknown("animation", Animations)
        : !SiteThemes.Contains(SiteTheme) ? Unknown("siteTheme", SiteThemes)
        : null;

    /// <summary>These preferences with any value no longer offered replaced by its default.</summary>
    public Preferences Sanitized() => new(
        BoardThemes.Contains(BoardTheme) ? BoardTheme : Default.BoardTheme,
        PieceSets.Contains(PieceSet) ? PieceSet : Default.PieceSet,
        Animations.Contains(Animation) ? Animation : Default.Animation,
        Coordinates,
        SiteThemes.Contains(SiteTheme) ? SiteTheme : Default.SiteTheme);

    private static string Unknown(string field, IReadOnlyList<string> allowed) => $"{field} must be one of {string.Join(", ", allowed)}.";
}

internal interface IPreferencesService : IService
{
    Task<Preferences> GetAsync(long userId, CancellationToken ct);

    /// <summary>Replaces the user's preferences; null (and nothing stored) when a value is not allowed.</summary>
    Task<Preferences?> SetAsync(long userId, Preferences preferences, CancellationToken ct);
}

/// <summary>Preferences on the primary, read through FusionCache (<see cref="CacheOptions.PreferencesMinutes"/>) and evicted on save.</summary>
internal sealed class PreferencesService(
    ProjectDbContext context,
    IFusionCache cache,
    IOptions<CacheOptions> cacheOptions,
    ILogger<PreferencesService> logger) : BaseService(context, logger), IPreferencesService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly TimeSpan _cacheTtl = TimeSpan.FromMinutes(cacheOptions.Value.PreferencesMinutes);

    public async Task<Preferences> GetAsync(long userId, CancellationToken ct) =>
        await cache.GetOrSetAsync(
            Constants.Cache.PreferencesByUser + userId,
            async (FusionCacheFactoryExecutionContext<Preferences> _, CancellationToken token) => await ReadAsync(userId, token),
            options => options.SetDuration(_cacheTtl),
            ct);

    public async Task<Preferences?> SetAsync(long userId, Preferences preferences, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(preferences);
        if (preferences.Problem() is not null)
        {
            return null;
        }

        User? user = await Context.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return null;
        }

        user.Preferences = JsonSerializer.Serialize(preferences, Json);
        await Context.SaveChangesAsync(ct);
        await cache.RemoveAsync(Constants.Cache.PreferencesByUser + userId, token: ct);
        return preferences;
    }

    private async Task<Preferences> ReadAsync(long userId, CancellationToken ct)
    {
        string? stored = await Context.Users.Where(u => u.Id == userId).Select(u => u.Preferences).SingleOrDefaultAsync(ct);
        return stored is null ? Preferences.Default : (JsonSerializer.Deserialize<Preferences>(stored, Json) ?? Preferences.Default).Sanitized();
    }
}
