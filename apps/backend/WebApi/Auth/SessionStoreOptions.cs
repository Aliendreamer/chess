namespace Chess.Backend.WebApi.Auth;

internal sealed class SessionStoreOptions
{
    public const string SectionName = "SessionStore";

    /// <summary>How often the cleanup service purges revoked/expired sessions.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(15);

    /// <summary>How long a revoked/expired row is kept before purge (audit window).</summary>
    public TimeSpan PurgeGrace { get; set; } = TimeSpan.FromDays(1);

    /// <summary>Lifetime of the PKCE cookie between login and callback.</summary>
    public TimeSpan PkceLifetime { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Refresh the access token this long before it actually expires.</summary>
    public TimeSpan AccessTokenLeeway { get; set; } = TimeSpan.FromSeconds(30);
}
