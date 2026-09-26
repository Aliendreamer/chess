namespace Chess.Backend.WebApi.Authentication;

/// <summary>Per-request identity, populated by <see cref="UserProvisioningPreProcessor"/>.</summary>
internal sealed class CurrentUser : ICurrentUser
{
    public bool IsAuthenticated => Subject is not null;

    public long? Id { get; private set; }

    public string? Subject { get; private set; }

    public string? Email { get; private set; }

    public string? FullName { get; private set; }

    public string? Username { get; private set; }

    public IReadOnlyList<string> Roles { get; private set; } = [];

    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.Ordinal);

    public void Populate(long id, string subject, string? email, string? fullName, string? username, IReadOnlyList<string> roles)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        Id = id;
        Subject = subject;
        Email = email;
        FullName = fullName;
        Username = username;
        Roles = roles;
    }
}
