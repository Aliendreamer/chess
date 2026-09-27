using Chess.Backend.WebApi.Matchmaking;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Matchmaking;

public sealed class MatchmakingValidatorsTests
{
    [Theory]
    [InlineData("5+3", true)]
    [InlineData("90+30", true)]
    [InlineData("4+2", false)] // not a D12 preset
    [InlineData("7d", false)] // correspondence is for invites only
    [InlineData("", false)]
    public void A_queue_is_a_preset_time_control(string tc, bool ok)
    {
        Assert.Equal(ok, new JoinQueueRequestValidator().TestValidate(new JoinQueueRequest { TimeControl = tc }).IsValid);
        Assert.Equal(ok, new LeaveQueueRequestValidator().TestValidate(new LeaveQueueRequest { TimeControl = tc }).IsValid);
    }

    [Fact]
    public void An_invite_needs_a_preset_and_a_colour()
    {
        CreateInviteRequestValidator v = new();
        v.TestValidate(new CreateInviteRequest { TimeControl = "10+5", Color = "purple" }).ShouldHaveValidationErrorFor(r => r.Color);
        v.TestValidate(new CreateInviteRequest { TimeControl = "4+2", Color = "white" }).ShouldHaveValidationErrorFor(r => r.TimeControl);
        v.TestValidate(new CreateInviteRequest { TimeControl = "10+5", Color = "random" }).ShouldNotHaveAnyValidationErrors();
        v.TestValidate(new CreateInviteRequest { TimeControl = "7d", Color = "white" }).ShouldNotHaveAnyValidationErrors();
        v.TestValidate(new CreateInviteRequest { TimeControl = "untimed", Color = "white" }).ShouldHaveValidationErrorFor(r => r.TimeControl);
    }

    [Theory]
    [InlineData("7c9e6679742540de944be07fc1f90ae7", true)]
    [InlineData("7c9e6679-7425-40de-944b-e07fc1f90ae7", true)]
    [InlineData("nope", false)]
    public void An_invite_route_needs_a_lower_case_guid(string id, bool ok) =>
        Assert.Equal(ok, new InviteRouteRequestValidator().TestValidate(new InviteRouteRequest { Id = id }).IsValid);
}
