using Chess.Backend.Akka;

namespace Chess.Backend.Tests.Akka;

public sealed class AkkaOptionsTests
{
    [Fact]
    public void Defaults_are_a_single_node_cluster_on_this_host()
    {
        AkkaOptions o = new();
        Assert.Equal("localhost", o.Hostname);
        Assert.Equal(8091, o.Port);
        Assert.Equal(["backend"], o.Roles);
        Assert.Equal(50, o.ShardCount);
        Assert.Equal(["akka.tcp://chess@localhost:8091"], o.EffectiveSeedNodes());
    }

    [Fact]
    public void Configured_seed_nodes_win_over_self()
    {
        AkkaOptions o = new() { Hostname = "backend", SeedNodes = ["akka.tcp://chess@backend:8091", "akka.tcp://chess@backend-2:8091"] };
        Assert.Equal(2, o.EffectiveSeedNodes().Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not a uri")]
    [InlineData("akka.tcp://other@backend:8091")]
    public void Validate_rejects_bad_seed_nodes(string seed)
    {
        AkkaOptions o = new() { SeedNodes = [seed] };
        Assert.Throws<InvalidOperationException>(o.Validate);
    }

    [Fact]
    public void Validate_rejects_empty_hostname_and_bad_port()
    {
        Assert.Throws<InvalidOperationException>(() => new AkkaOptions { Hostname = "" }.Validate());
        Assert.Throws<InvalidOperationException>(() => new AkkaOptions { Port = 0 }.Validate());
    }
}
