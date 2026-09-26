using Chess.Backend.WebApi.Authentication;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Authentication;

public sealed class UserProvisioningPreProcessorTests
{
    private static (IPreProcessorContext Context, CurrentUser Current, Mock<IUserProvisioningService> Provisioning) Build(ClaimsPrincipal user)
    {
        CurrentUser current = new();
        Mock<IUserProvisioningService> provisioning = new();
        provisioning.Setup(p => p.EnsureUserAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>())).ReturnsAsync(42);
        DefaultHttpContext http = new()
        {
            User = user,
            RequestServices = new ServiceCollection()
                .AddSingleton(provisioning.Object)
                .AddSingleton<ICurrentUser>(current)
                .BuildServiceProvider(),
        };
        Mock<IPreProcessorContext> ctx = new();
        ctx.SetupGet(c => c.HttpContext).Returns(http);
        return (ctx.Object, current, provisioning);
    }

    [Fact]
    public async Task Authenticated_request_is_provisioned_and_current_user_populated()
    {
        ClaimsPrincipal user = new(new ClaimsIdentity(
        [
            new Claim(Constants.Claims.Subject, "sub-1"),
            new Claim(Constants.Claims.Email, "a@b.c"),
            new Claim(Constants.Claims.Name, "Ann"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(ClaimTypes.Role, "User"),
        ], "test"));
        (IPreProcessorContext ctx, CurrentUser current, Mock<IUserProvisioningService> provisioning) = Build(user);

        await new UserProvisioningPreProcessor().PreProcessAsync(ctx, CancellationToken.None);

        provisioning.Verify(p => p.EnsureUserAsync("sub-1", "a@b.c", "Ann", null, It.IsAny<CancellationToken>()), Times.Once);
        Assert.True(current.IsAuthenticated);
        Assert.Equal(42, current.Id);
        Assert.Equal("sub-1", current.Subject);
        Assert.Equal("a@b.c", current.Email);
        Assert.Equal("Ann", current.FullName);
        Assert.Equal(["Admin", "User"], current.Roles);
        Assert.True(current.IsInRole("Admin"));
        Assert.False(current.IsInRole("Nope"));
    }

    [Fact]
    public async Task Falls_back_to_standard_claim_types()
    {
        ClaimsPrincipal user = new(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "sub-2"),
            new Claim(ClaimTypes.Email, "z@b.c"),
            new Claim(Constants.Claims.PreferredUsername, "zed"),
        ], "test"));
        (IPreProcessorContext ctx, CurrentUser current, Mock<IUserProvisioningService> provisioning) = Build(user);

        await new UserProvisioningPreProcessor().PreProcessAsync(ctx, CancellationToken.None);

        provisioning.Verify(p => p.EnsureUserAsync("sub-2", "z@b.c", "zed", "zed", It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal("zed", current.FullName);
    }

    [Fact]
    public async Task Anonymous_request_passes_through()
    {
        (IPreProcessorContext ctx, CurrentUser current, Mock<IUserProvisioningService> provisioning) = Build(new ClaimsPrincipal(new ClaimsIdentity()));
        await new UserProvisioningPreProcessor().PreProcessAsync(ctx, CancellationToken.None);
        provisioning.VerifyNoOtherCalls();
        Assert.False(current.IsAuthenticated);
    }

    [Fact]
    public async Task Authenticated_without_subject_passes_through()
    {
        ClaimsPrincipal user = new(new ClaimsIdentity([new Claim(Constants.Claims.Email, "x@y.z")], "test"));
        (IPreProcessorContext ctx, CurrentUser current, Mock<IUserProvisioningService> provisioning) = Build(user);
        await new UserProvisioningPreProcessor().PreProcessAsync(ctx, CancellationToken.None);
        provisioning.VerifyNoOtherCalls();
        Assert.False(current.IsAuthenticated);
    }

    [Fact]
    public void CurrentUser_populate_rejects_empty_subject() =>
        Assert.Throws<ArgumentException>(() => new CurrentUser().Populate(1, string.Empty, null, null, []));
}
