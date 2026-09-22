using Chess.Backend.WebApi.Hubs;

namespace Chess.Backend.Tests.Hubs;

public sealed class HubGroupsTests
{
    [Fact]
    public void Group_name_is_prefixed_and_validated()
    {
        Assert.Equal("ping:p1", HubGroups.Ping("p1"));
        Assert.Throws<ArgumentException>(() => HubGroups.Ping(""));
        Assert.Throws<ArgumentException>(() => HubGroups.Ping("has space"));
    }
}
