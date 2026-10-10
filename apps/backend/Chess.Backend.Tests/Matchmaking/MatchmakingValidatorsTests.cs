using Chess.Backend.WebApi.Matchmaking;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Matchmaking;

public sealed class MatchmakingValidatorsTests
{
    [Theory]
    [InlineData("5+3", true)]
    [InlineData("90+30", true)]
    [InlineData("4+2", false)] // not a D12 preset
    [InlineData("7d", false)] // correspondence games are gone
    [InlineData("", false)]
    public void A_queue_is_a_preset_time_control(string tc, bool ok)
    {
        Assert.Equal(ok, new JoinQueueRequestValidator().TestValidate(new JoinQueueRequest { TimeControl = tc }).IsValid);
        Assert.Equal(ok, new LeaveQueueRequestValidator().TestValidate(new LeaveQueueRequest { TimeControl = tc }).IsValid);
    }
}
