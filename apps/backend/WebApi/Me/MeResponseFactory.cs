using Chess.Backend.WebApi.Authentication;

namespace Chess.Backend.WebApi.Me;

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
