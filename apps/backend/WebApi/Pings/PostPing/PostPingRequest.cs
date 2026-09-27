using Chess.Backend.Akka.Ping;
using FluentValidation;

namespace Chess.Backend.WebApi.Pings;

internal sealed class PostPingRequest
{
    /// <summary>The ping id, from the route (<c>^[a-z0-9-]{1,64}$</c>).</summary>
    public string Id { get; init; } = string.Empty;

    public string Text { get; init; } = string.Empty;
}

internal sealed class PostPingRequestValidator : Validator<PostPingRequest>
{
    public PostPingRequestValidator()
    {
        RuleFor(r => r.Id).Matches(PingIds.Pattern).WithMessage($"Ping id must match {PingIds.Pattern}.");
        RuleFor(r => r.Text).NotEmpty().MaximumLength(200);
    }
}
