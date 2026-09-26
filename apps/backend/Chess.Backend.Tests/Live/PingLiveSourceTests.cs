using Akka.Actor;
using Akka.TestKit;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Live;

namespace Chess.Backend.Tests.Live;

public sealed class PingLiveSourceTests : TestKit
{
    [Fact]
    public async Task The_snapshot_is_the_actors_state_as_a_live_frame_with_its_seq()
    {
        TestProbe region = CreateTestProbe();
        PingLiveSource source = new(new FixedRegion<PingActor>(region.Ref));
        PingState state = new("abc", 3, "hi", DateTimeOffset.UnixEpoch, 3);

        Task<LiveFrame?> snapshot = source.SnapshotAsync("abc", CancellationToken.None);
        Assert.Equal("abc", region.ExpectMsg<GetPingState>().PingId);
        region.Reply(state);

        LiveFrame frame = (await snapshot)!;
        Assert.Equal(("ping:abc", 3L), (frame.Topic, frame.Seq));
        Assert.Same(state, frame.Payload);
    }

    [Fact]
    public void Validates_ids_with_the_ping_rules()
    {
        PingLiveSource source = new(new FixedRegion<PingActor>(CreateTestProbe().Ref));

        Assert.Equal("ping", source.Kind);
        Assert.True(source.IsValidId("abc-1"));
        Assert.False(source.IsValidId("Has Space")); // the full rule set is PingIdsTests'; this proves delegation
    }
}
