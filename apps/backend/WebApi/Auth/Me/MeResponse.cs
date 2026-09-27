namespace Chess.Backend.WebApi.Auth;

/// <summary><see cref="Username"/> is the display name (D23): <c>preferred_username</c>, else <c>Player {id}</c>.</summary>
internal sealed record MeResponse(long Id, string Subject, string? Email, IReadOnlyList<string> Roles, string Username);

internal static class MeResponseFactory
{
    public static bool TryCreate(ICurrentUser user, [NotNullWhen(true)] out MeResponse? response)
    {
        ArgumentNullException.ThrowIfNull(user);
        response = null;
        if (!user.IsAuthenticated || user.Id is null || user.Subject is null)
        {
            return false;
        }

        response = new MeResponse(user.Id.Value, user.Subject, user.Email, [.. user.Roles], user.Username ?? $"Player {user.Id.Value}");
        return true;
    }
}
