namespace Chess.Backend.WebApi.Authentication;

internal interface ICurrentUser
{
    bool IsAuthenticated { get; }

    long? Id { get; }

    string? Subject { get; }

    string? Email { get; }

    string? FullName { get; }

    IReadOnlyList<string> Roles { get; }

    bool IsInRole(string role);
}
