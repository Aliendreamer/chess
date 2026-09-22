using System.Net;
using Chess.Backend.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;

namespace Chess.Backend.Tests.Services;

public sealed class ForwardedHeadersTests
{
    private static IConfiguration Config(params (string Key, string Value)[] pairs) =>
        new ConfigurationBuilder().AddInMemoryCollection(pairs.Select(p => new KeyValuePair<string, string?>(p.Key, p.Value))).Build();

    [Fact]
    public void Default_trusts_only_loopback_and_reads_one_hop()
    {
        ForwardedHeadersOptions o = ApplicationExtensions.BuildForwardedHeaders(Config());
        Assert.Equal(1, o.ForwardLimit);
        Assert.Single(o.KnownIPNetworks); // ASP.NET's loopback default
        Assert.Single(o.KnownProxies);
        Assert.Equal(ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost, o.ForwardedHeaders);
    }

    [Fact]
    public void Configured_networks_and_proxies_are_added()
    {
        ForwardedHeadersOptions o = ApplicationExtensions.BuildForwardedHeaders(Config(
            ("ForwardedHeaders:KnownNetworks:0", "172.30.0.0/24"),
            ("ForwardedHeaders:KnownProxies:0", "10.0.0.5")));
        Assert.Contains(o.KnownIPNetworks, n => n.Contains(IPAddress.Parse("172.30.0.8")));
        Assert.DoesNotContain(o.KnownIPNetworks, n => n.Contains(IPAddress.Parse("172.31.0.8")));
        Assert.Contains(IPAddress.Parse("10.0.0.5"), o.KnownProxies);
    }

    [Fact]
    public void Rejects_malformed_cidr()
    {
        Assert.ThrowsAny<FormatException>(() => ApplicationExtensions.BuildForwardedHeaders(Config(("ForwardedHeaders:KnownNetworks:0", "not-a-cidr"))));
        Assert.Throws<ArgumentNullException>(() => ApplicationExtensions.BuildForwardedHeaders(null!));
    }
}
