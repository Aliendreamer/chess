using Chess.Backend.Akka.Ping;
using FluentValidation;

namespace Chess.Backend.WebApi.Pings;

internal sealed class GetPingLiveRequest
{
    /// <summary>The ping id, from the route.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class GetPingLiveRequestValidator : Validator<GetPingLiveRequest>
{
    public GetPingLiveRequestValidator() =>
        RuleFor(r => r.Id).Matches(PingIds.Pattern).WithMessage($"Ping id must match {PingIds.Pattern}.");
}
