using Chess.Backend.Live;

namespace Chess.Backend.Tests.Live;

public sealed class LiveTopicsTests
{
    [Fact]
    public void Parses_kind_and_id()
    {
        Assert.True(LiveTopics.TryParse("ping:abc-1", out string kind, out string id));
        Assert.Equal(("ping", "abc-1"), (kind, id));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData(":abc")]
    [InlineData("ping:")]
    public void Rejects_topics_without_a_kind_and_an_id(string? topic) =>
        Assert.False(LiveTopics.TryParse(topic, out _, out _));

    [Fact]
    public void Only_the_first_colon_separates_kind_from_id() =>
        Assert.True(LiveTopics.TryParse("game:a:b", out string kind, out string id) && kind == "game" && id == "a:b");

    [Fact]
    public void Formats_a_topic() => Assert.Equal("ping:abc", LiveTopics.Format("ping", "abc"));
}

public sealed class LiveTopicResolverTests
{
    private sealed class FakeSource(string kind) : ILiveTopicSource
    {
        public string Kind => kind;

        public bool IsValidId(string id) => id != "bad";

        public Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct) =>
            Task.FromResult<LiveFrame?>(new LiveFrame(LiveTopics.Format(kind, id), 1, id));
    }

    private static readonly LiveTopicResolver Resolver = new([new FakeSource("ping"), new FakeSource("game")]);

    [Fact]
    public void Resolves_the_source_for_a_known_kind_and_valid_id()
    {
        Assert.True(Resolver.TryResolve("game:g1", out ILiveTopicSource? source, out string id));
        Assert.Equal(("game", "g1"), (source!.Kind, id));
    }

    [Theory]
    [InlineData("nope:x")]
    [InlineData("ping:bad")]
    [InlineData("garbage")]
    public void Refuses_an_unknown_kind_an_invalid_id_or_a_malformed_topic(string topic) =>
        Assert.False(Resolver.TryResolve(topic, out _, out _));

    [Fact]
    public void Two_sources_for_one_kind_is_a_startup_error() =>
        Assert.Throws<InvalidOperationException>(() => new LiveTopicResolver([new FakeSource("ping"), new FakeSource("ping")]));
}
