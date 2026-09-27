using Chess.Backend.WebApi.Pings;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Pings;

public sealed class PingValidatorsTests
{
    [Fact]
    public void A_ping_needs_a_valid_id_and_text_up_to_200_chars()
    {
        PostPingRequestValidator v = new();
        v.TestValidate(new PostPingRequest { Id = "p-1", Text = "" }).ShouldHaveValidationErrorFor(r => r.Text);
        v.TestValidate(new PostPingRequest { Id = "p-1", Text = new string('x', 201) }).ShouldHaveValidationErrorFor(r => r.Text);
        v.TestValidate(new PostPingRequest { Id = "Not-Lower", Text = "ok" }).ShouldHaveValidationErrorFor(r => r.Id);
        v.TestValidate(new PostPingRequest { Id = "p-1", Text = "ok" }).ShouldNotHaveAnyValidationErrors();
    }

    [Theory]
    [InlineData("demo-1", true)]
    [InlineData("", false)]
    [InlineData("has space", false)]
    public void A_live_read_needs_a_valid_id(string id, bool ok) =>
        Assert.Equal(ok, new GetPingLiveRequestValidator().TestValidate(new GetPingLiveRequest { Id = id }).IsValid);

    [Fact]
    public void A_list_needs_a_positive_limit_and_a_readable_cursor()
    {
        ListPingsRequestValidator v = new();
        v.TestValidate(new ListPingsRequest { Limit = 0 }).ShouldHaveValidationErrorFor(r => r.Limit);
        v.TestValidate(new ListPingsRequest { Cursor = "not a cursor" }).ShouldHaveValidationErrorFor(r => r.Cursor);
        v.TestValidate(new ListPingsRequest { Limit = 20 }).ShouldNotHaveAnyValidationErrors();
    }
}
