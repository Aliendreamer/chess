using Chess.Backend.WebApi.Authentication;
using Chess.Backend.WebApi.Me;

namespace Chess.Backend.Tests.Me;

public sealed class MeResponseFactoryTests
{
    [Fact]
    public void Builds_response_from_authenticated_user()
    {
        CurrentUser user = new();
        user.Populate(7, "sub-7", "s@e.v", "Seven", ["User"]);

        Assert.True(MeResponseFactory.TryCreate(user, out MeResponse? me));
        Assert.Equal(7, me.Id);
        Assert.Equal("sub-7", me.Subject);
        Assert.Equal("s@e.v", me.Email);
        Assert.Equal(["User"], me.Roles);
    }

    [Fact]
    public void Anonymous_user_yields_nothing()
    {
        Assert.False(MeResponseFactory.TryCreate(new CurrentUser(), out MeResponse? me));
        Assert.Null(me);
    }

    [Fact]
    public void Guards_null() => Assert.Throws<ArgumentNullException>(() => MeResponseFactory.TryCreate(null!, out _));
}
