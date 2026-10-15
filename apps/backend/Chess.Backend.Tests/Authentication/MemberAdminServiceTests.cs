using Chess.Backend.Akka.Presence;
using Microsoft.AspNetCore.Http;

namespace Chess.Backend.Tests.Authentication;

/// <summary>Member admin (member-admin D3): Keycloak first, our rows only after it agreed, and nobody acts on themselves.</summary>
public sealed class MemberAdminServiceTests : IDisposable
{
    private const long Me = 1;
    private readonly ProjectDbContext _db = TestDb.Create();
    private readonly Mock<IKeycloakAdmin> _keycloak = new();
    private readonly Mock<ISessionStore> _sessions = new();
    private readonly Mock<IUserProvisioningService> _provisioning = new();
    private readonly Mock<IMemberEviction> _eviction = new();

    public MemberAdminServiceTests()
    {
        _db.Users.AddRange(
            new User { Id = -1, Sub = "engine-1320", Username = "Stockfish" },
            new User { Id = Me, Sub = "kc-me", Username = "testuser", FullName = "Test User" },
            new User { Id = 2, Sub = "kc-bob", Username = "bob", Email = "bob@x.org" },
            new User { Id = 3, Sub = "kc-ann", Username = "Ann", Active = false });
        _db.SaveChanges();
        _keycloak.Setup(k => k.AdminIdsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new HashSet<string>(["kc-me"]));
        _keycloak.Setup(k => k.CreateUserAsync(It.IsAny<NewKeycloakUser>(), It.IsAny<CancellationToken>())).ReturnsAsync("kc-carol");
    }

    public void Dispose() => _db.Dispose();

    private MemberAdminService Service() =>
        new(_db, _keycloak.Object, _sessions.Object, _provisioning.Object, _eviction.Object, NullLogger<MemberAdminService>.Instance);

    private static KeycloakAdminException Down() => new("connection refused");

    [Fact]
    public async Task The_list_has_every_member_but_the_engine_with_who_holds_admin()
    {
        AdminResult<IReadOnlyList<AdminMemberItem>> result = await Service().ListAsync(CancellationToken.None);

        Assert.Equal(
            [("Ann", false, false), ("bob", true, false), ("testuser", true, true)],
            result.Value!.Select(i => (i.Username, i.Active, i.Admin)));
    }

    [Fact]
    public async Task Creating_a_member_makes_the_keycloak_user_and_the_row_and_shows_the_password_once()
    {
        AdminResult<CreatedMember> result = await Service().CreateAsync("Carol", " Carol Smith ", " ", CancellationToken.None);

        CreatedMember created = result.Value!;
        Assert.Equal(("carol", "Carol Smith", (string?)null, true, false), (created.Member.Username, created.Member.FullName, created.Member.Email, created.Member.Active, created.Member.Admin));
        Assert.Equal(16, created.TemporaryPassword.Length);
        _keycloak.Verify(k => k.CreateUserAsync(new NewKeycloakUser("carol", "Carol Smith", null, created.TemporaryPassword), It.IsAny<CancellationToken>()));
        User row = await _db.Users.SingleAsync(u => u.Sub == "kc-carol");
        Assert.Equal((created.Member.Id, "carol", true), (row.Id, row.Username, row.Active));
    }

    [Fact]
    public async Task A_taken_username_is_refused_by_us_or_by_keycloak_and_nothing_is_made()
    {
        AdminResult<CreatedMember> ours = await Service().CreateAsync("ANN", "Ann Again", null, CancellationToken.None);
        Assert.Equal((StatusCodes.Status409Conflict, MemberAdminService.Taken), (ours.Status, ours.Error));
        _keycloak.Verify(k => k.CreateUserAsync(It.IsAny<NewKeycloakUser>(), It.IsAny<CancellationToken>()), Times.Never);

        _keycloak.Setup(k => k.CreateUserAsync(It.IsAny<NewKeycloakUser>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeycloakAdminException("That username is taken.", System.Net.HttpStatusCode.Conflict));
        AdminResult<CreatedMember> theirs = await Service().CreateAsync("dave", "Dave", null, CancellationToken.None);
        Assert.Equal((StatusCodes.Status409Conflict, MemberAdminService.Taken), (theirs.Status, theirs.Error));
        Assert.Equal(4, await _db.Users.CountAsync());
    }

    [Fact]
    public async Task Keycloak_down_is_a_502_and_changes_nothing_here()
    {
        _keycloak.Setup(k => k.CreateUserAsync(It.IsAny<NewKeycloakUser>(), It.IsAny<CancellationToken>())).ThrowsAsync(Down());
        _keycloak.Setup(k => k.SetEnabledAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).ThrowsAsync(Down());

        AdminResult<CreatedMember> created = await Service().CreateAsync("dave", "Dave", null, CancellationToken.None);
        AdminResult<AdminMemberItem> deactivated = await Service().SetActiveAsync(2, active: false, Me, CancellationToken.None);

        Assert.Equal((StatusCodes.Status502BadGateway, "Keycloak did not answer: connection refused"), (created.Status, created.Error));
        Assert.Equal(StatusCodes.Status502BadGateway, deactivated.Status);
        Assert.True((await _db.Users.AsNoTracking().SingleAsync(u => u.Id == 2)).Active);
        _sessions.VerifyNoOtherCalls();
        _eviction.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Deactivating_disables_signs_out_and_lets_go_of_the_live_state()
    {
        _sessions.Setup(s => s.RevokeAllAsync("kc-bob", It.IsAny<CancellationToken>())).ReturnsAsync(2);

        AdminResult<AdminMemberItem> result = await Service().SetActiveAsync(2, active: false, Me, CancellationToken.None);

        Assert.False(result.Value!.Active);
        _keycloak.Verify(k => k.SetEnabledAsync("kc-bob", false, It.IsAny<CancellationToken>()));
        _sessions.Verify(s => s.RevokeAllAsync("kc-bob", It.IsAny<CancellationToken>()));
        _provisioning.Verify(p => p.ForgetActiveAsync(2, It.IsAny<CancellationToken>()));
        _eviction.Verify(e => e.EvictAsync(2, It.IsAny<CancellationToken>()));
        Assert.False((await _db.Users.AsNoTracking().SingleAsync(u => u.Id == 2)).Active);
    }

    [Fact]
    public async Task Reactivating_enables_and_forgets_the_cached_answer()
    {
        AdminResult<AdminMemberItem> result = await Service().SetActiveAsync(3, active: true, Me, CancellationToken.None);

        Assert.True(result.Value!.Active);
        _keycloak.Verify(k => k.SetEnabledAsync("kc-ann", true, It.IsAny<CancellationToken>()));
        _provisioning.Verify(p => p.ForgetActiveAsync(3, It.IsAny<CancellationToken>()));
        _eviction.Verify(e => e.RefreshList());
        _eviction.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Nobody_deactivates_themselves_or_removes_their_own_admin()
    {
        AdminResult<AdminMemberItem> deactivate = await Service().SetActiveAsync(Me, active: false, Me, CancellationToken.None);
        AdminResult<AdminMemberItem> demote = await Service().SetAdminAsync(Me, admin: false, Me, CancellationToken.None);

        Assert.Equal((StatusCodes.Status400BadRequest, MemberAdminService.NotYourself), (deactivate.Status, deactivate.Error));
        Assert.Equal((StatusCodes.Status400BadRequest, MemberAdminService.NotYourself), (demote.Status, demote.Error));
        _keycloak.Verify(k => k.SetEnabledAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
        _keycloak.Verify(k => k.SetAdminAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Admin_is_granted_through_keycloak()
    {
        AdminResult<AdminMemberItem> result = await Service().SetAdminAsync(2, admin: true, Me, CancellationToken.None);

        Assert.True(result.Value!.Admin);
        _keycloak.Verify(k => k.SetAdminAsync("kc-bob", true, It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task A_reset_password_is_temporary_and_the_engine_is_nobody_to_reset()
    {
        AdminResult<string> reset = await Service().ResetPasswordAsync(2, CancellationToken.None);
        AdminResult<string> engine = await Service().ResetPasswordAsync(-1, CancellationToken.None);

        _keycloak.Verify(k => k.ResetPasswordAsync("kc-bob", reset.Value!, It.IsAny<CancellationToken>()));
        Assert.Equal((StatusCodes.Status404NotFound, MemberAdminService.NoSuchMember), (engine.Status, engine.Error));
    }
}
