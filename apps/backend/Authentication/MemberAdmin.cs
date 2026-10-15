using Chess.Backend.Akka.Presence;

namespace Chess.Backend.Authentication;

/// <summary>One member as an Admin sees them (member-admin): engine players are never listed.</summary>
internal sealed record AdminMemberItem(
    long Id,
    string Username,
    string? FullName,
    string? Email,
    bool Active,
    bool Admin,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeenAt);

/// <summary>A member just made, with the temporary password shown to the Admin once.</summary>
internal sealed record CreatedMember(AdminMemberItem Member, string TemporaryPassword);

/// <summary>An answer of <see cref="IMemberAdminService"/>: a value, or an HTTP status with the words to show.</summary>
internal sealed record AdminResult<T>(T? Value, int Status, string? Error)
    where T : class
{
    public static AdminResult<T> Ok(T value) => new(value, StatusCodes.Status200OK, null);

    public static AdminResult<T> Fail(int status, string error) => new(null, status, error);
}

/// <summary>
/// Member admin (member-admin D3): Keycloak first, our database only after Keycloak said yes, so a Keycloak failure
/// (a 502) changes nothing here. An Admin cannot deactivate themselves or remove their own Admin role.
/// </summary>
internal interface IMemberAdminService : IService
{
    Task<AdminResult<IReadOnlyList<AdminMemberItem>>> ListAsync(CancellationToken ct);

    Task<AdminResult<CreatedMember>> CreateAsync(string username, string fullName, string? email, CancellationToken ct);

    Task<AdminResult<AdminMemberItem>> SetActiveAsync(long id, bool active, long actorId, CancellationToken ct);

    Task<AdminResult<string>> ResetPasswordAsync(long id, CancellationToken ct);

    Task<AdminResult<AdminMemberItem>> SetAdminAsync(long id, bool admin, long actorId, CancellationToken ct);
}

internal sealed class MemberAdminService(
    ProjectDbContext context,
    IKeycloakAdmin keycloak,
    ISessionStore sessions,
    IUserProvisioningService provisioning,
    IMemberEviction eviction,
    ILogger<MemberAdminService> logger) : BaseService(context, logger), IMemberAdminService
{
    public const string Taken = "That username is taken.";
    public const string NotYourself = "You cannot do that to yourself.";
    public const string NoSuchMember = "No such member.";

    public async Task<AdminResult<IReadOnlyList<AdminMemberItem>>> ListAsync(CancellationToken ct)
    {
        IReadOnlySet<string> admins;
        try
        {
            admins = await keycloak.AdminIdsAsync(ct);
        }
        catch (KeycloakAdminException e)
        {
            return BadGateway<IReadOnlyList<AdminMemberItem>>(e);
        }

        List<User> users = await Context.Users.AsNoTracking().Where(u => u.Id > 0).ToListAsync(ct);
        List<AdminMemberItem> items = [.. users
            .Select(u => Item(u, admins.Contains(u.Sub)))
            .OrderBy(i => i.Username, StringComparer.OrdinalIgnoreCase)];
        return AdminResult<IReadOnlyList<AdminMemberItem>>.Ok(items);
    }

    public async Task<AdminResult<CreatedMember>> CreateAsync(string username, string fullName, string? email, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(username);
        string name = username.Trim().ToLowerInvariant();
#pragma warning disable CA1304, CA1311, CA1862 // translated to SQL lower(); the culture-specific overloads are not
        if (await Context.Users.AnyAsync(u => u.Username != null && u.Username.ToLower() == name, ct))
#pragma warning restore CA1304, CA1311, CA1862
        {
            return AdminResult<CreatedMember>.Fail(StatusCodes.Status409Conflict, Taken);
        }

        string password = TemporaryPassword.New();
        string? mail = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        string sub;
        try
        {
            sub = await keycloak.CreateUserAsync(new NewKeycloakUser(name, fullName.Trim(), mail, password), ct);
        }
        catch (KeycloakAdminException e) when (e.IsConflict)
        {
            return AdminResult<CreatedMember>.Fail(StatusCodes.Status409Conflict, Taken);
        }
        catch (KeycloakAdminException e)
        {
            return BadGateway<CreatedMember>(e);
        }

        // Listed straight away; the member's first sign-in finds this row by sub (JIT provisioning).
        User user = new() { Sub = sub, Username = name, FullName = fullName.Trim(), Email = mail };
        Context.Users.Add(user);
        await Context.SaveChangesAsync(ct);
        eviction.RefreshList();
        Log.MemberCreated(Logger, user.Id, name);
        return AdminResult<CreatedMember>.Ok(new CreatedMember(Item(user, admin: false), password));
    }

    public async Task<AdminResult<AdminMemberItem>> SetActiveAsync(long id, bool active, long actorId, CancellationToken ct)
    {
        if (!active && id == actorId)
        {
            return AdminResult<AdminMemberItem>.Fail(StatusCodes.Status400BadRequest, NotYourself);
        }

        User? user = await FindAsync(id, ct);
        if (user is null)
        {
            return AdminResult<AdminMemberItem>.Fail(StatusCodes.Status404NotFound, NoSuchMember);
        }

        bool admin;
        try
        {
            admin = await keycloak.IsAdminAsync(user.Sub, ct);
            await keycloak.SetEnabledAsync(user.Sub, active, ct);
        }
        catch (KeycloakAdminException e)
        {
            return BadGateway<AdminMemberItem>(e);
        }

        user.Active = active;
        await Context.SaveChangesAsync(ct);
        await provisioning.ForgetActiveAsync(id, ct);
        if (!active)
        {
            // Signed out at once: every session row dies, and the live state lets go of them.
            int revoked = await sessions.RevokeAllAsync(user.Sub, ct);
            await eviction.EvictAsync(id, ct);
            Log.MemberDeactivated(Logger, id, revoked);
        }
        else
        {
            eviction.RefreshList();
            Log.MemberReactivated(Logger, id);
        }

        return AdminResult<AdminMemberItem>.Ok(Item(user, admin));
    }

    public async Task<AdminResult<string>> ResetPasswordAsync(long id, CancellationToken ct)
    {
        User? user = await FindAsync(id, ct);
        if (user is null)
        {
            return AdminResult<string>.Fail(StatusCodes.Status404NotFound, NoSuchMember);
        }

        string password = TemporaryPassword.New();
        try
        {
            await keycloak.ResetPasswordAsync(user.Sub, password, ct);
        }
        catch (KeycloakAdminException e)
        {
            return BadGateway<string>(e);
        }

        return AdminResult<string>.Ok(password);
    }

    public async Task<AdminResult<AdminMemberItem>> SetAdminAsync(long id, bool admin, long actorId, CancellationToken ct)
    {
        if (!admin && id == actorId)
        {
            return AdminResult<AdminMemberItem>.Fail(StatusCodes.Status400BadRequest, NotYourself);
        }

        User? user = await FindAsync(id, ct);
        if (user is null)
        {
            return AdminResult<AdminMemberItem>.Fail(StatusCodes.Status404NotFound, NoSuchMember);
        }

        try
        {
            await keycloak.SetAdminAsync(user.Sub, admin, ct);
        }
        catch (KeycloakAdminException e)
        {
            return BadGateway<AdminMemberItem>(e);
        }

        return AdminResult<AdminMemberItem>.Ok(Item(user, admin));
    }

    private Task<User?> FindAsync(long id, CancellationToken ct) =>
        id <= 0 ? Task.FromResult<User?>(null) : Context.Users.SingleOrDefaultAsync(u => u.Id == id, ct);

    private static AdminMemberItem Item(User u, bool admin) =>
        new(u.Id, MemberDirectory.DisplayName(u.Id, u.Username), u.FullName, u.Email, u.Active, admin, u.CreatedAt, u.LastSeenAt);

    private AdminResult<T> BadGateway<T>(KeycloakAdminException e)
        where T : class
    {
        Log.KeycloakAdminFailed(Logger, e, e.Message);
        return AdminResult<T>.Fail(StatusCodes.Status502BadGateway, "Keycloak did not answer: " + e.Message);
    }
}
