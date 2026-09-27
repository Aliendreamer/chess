using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class ReplayDeadLettersRequest
{
    /// <summary>The projection's consumer group, from the route (e.g. <c>chess.rm-games</c>).</summary>
    public string GroupId { get; init; } = string.Empty;

    /// <summary>The quarantined aggregate, from the route, exactly as the dead-letter list shows it.</summary>
    public string AggregateId { get; init; } = string.Empty;
}

internal sealed class ReplayDeadLettersRequestValidator : Validator<ReplayDeadLettersRequest>
{
    public ReplayDeadLettersRequestValidator()
    {
        RuleFor(r => r.GroupId).NotEmpty();
        RuleFor(r => r.AggregateId).NotEmpty();
    }
}
