using Chess.Backend.WebApi.Pings;
using FluentValidation.TestHelper;

namespace Chess.Backend.Tests.Pings;

public sealed class PingRequestValidatorTests
{
    [Fact]
    public void Requires_text_up_to_200_chars()
    {
        PingRequestValidator v = new();
        v.TestValidate(new PingRequest { Text = "" }).ShouldHaveValidationErrorFor(r => r.Text);
        v.TestValidate(new PingRequest { Text = new string('x', 201) }).ShouldHaveValidationErrorFor(r => r.Text);
        v.TestValidate(new PingRequest { Text = "ok" }).ShouldNotHaveAnyValidationErrors();
    }
}
