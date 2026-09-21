using Chess.Backend.WebApi.Authentication;

namespace Chess.Backend.Tests.Authentication;

public sealed class KeycloakRolesClaimsTransformationTests
{
    private static ClaimsPrincipal Principal(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, "test", Constants.Claims.Subject, ClaimTypes.Role));

    [Fact]
    public async Task Flattens_realm_roles_into_role_claims()
    {
        ClaimsPrincipal p = Principal(
            new Claim(Constants.Claims.Subject, "s"),
            new Claim(Constants.Claims.RealmAccess, """{"roles":["Admin","User","offline_access"]}"""));

        ClaimsPrincipal result = await new KeycloakRolesClaimsTransformation().TransformAsync(p);

        Assert.Same(p, result);
        Assert.True(result.IsInRole("Admin"));
        Assert.True(result.IsInRole("User"));
        Assert.Equal(3, result.FindAll(ClaimTypes.Role).Count());
    }

    [Fact]
    public async Task Is_idempotent_across_repeated_transformation()
    {
        ClaimsPrincipal p = Principal(
            new Claim(Constants.Claims.Subject, "s"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(Constants.Claims.RealmAccess, """{"roles":["Admin"]}"""));
        KeycloakRolesClaimsTransformation t = new();

        await t.TransformAsync(p);
        await t.TransformAsync(p);

        Assert.Single(p.FindAll(ClaimTypes.Role));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("""{"roles":"Admin"}""")]
    [InlineData("""{"roles":[1,null,""]}""")]
    public async Task Tolerates_missing_or_malformed_realm_access(string? realmAccess)
    {
        List<Claim> claims = [new Claim(Constants.Claims.Subject, "s")];
        if (realmAccess is not null)
        {
            claims.Add(new Claim(Constants.Claims.RealmAccess, realmAccess));
        }

        ClaimsPrincipal result = await new KeycloakRolesClaimsTransformation().TransformAsync(Principal([.. claims]));
        Assert.Empty(result.FindAll(ClaimTypes.Role));
    }

    [Fact]
    public async Task Leaves_non_claims_identity_untouched()
    {
        ClaimsPrincipal p = new(new System.Security.Principal.GenericIdentity("x"));
        Assert.Same(p, await new KeycloakRolesClaimsTransformation().TransformAsync(p));
        await Assert.ThrowsAsync<ArgumentNullException>(() => new KeycloakRolesClaimsTransformation().TransformAsync(null!));
    }
}
