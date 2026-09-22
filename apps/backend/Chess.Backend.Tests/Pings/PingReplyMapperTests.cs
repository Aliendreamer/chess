using Chess.Backend.Akka.Ping;
using Chess.Backend.WebApi.Pings;
using Microsoft.AspNetCore.Http;

namespace Chess.Backend.Tests.Pings;

public sealed class PingReplyMapperTests
{
    [Fact]
    public void PingState_maps_to_success()
    {
        PingState state = new("p1", 1, "hi", DateTimeOffset.UtcNow, 1);
        PingReplyOutcome outcome = PingReplyMapper.Map(state);
        Assert.True(outcome.IsSuccess);
        Assert.Same(state, outcome.State);
    }

    [Fact]
    public void PingRejected_maps_to_400()
    {
        PingRejected rejected = new("p1", "Text is required.");
        PingReplyOutcome outcome = PingReplyMapper.Map(rejected);
        Assert.False(outcome.IsSuccess);
        Assert.Equal(StatusCodes.Status400BadRequest, outcome.ErrorStatusCode);
        Assert.Equal("Text is required.", outcome.ErrorMessage);
    }

    [Fact]
    public void Unexpected_reply_maps_to_502()
    {
        PingReplyOutcome outcome = PingReplyMapper.Map("not a known reply");
        Assert.False(outcome.IsSuccess);
        Assert.Equal(StatusCodes.Status502BadGateway, outcome.ErrorStatusCode);
    }
}
