using Chess.Backend.Training;
using FluentValidation;

namespace Chess.Backend.WebApi.Training;

internal sealed class NextTrainingRequest
{
    /// <summary><c>games</c> (the member's own mistakes) or <c>library</c> (master games).</summary>
    [QueryParam]
    public string Mode { get; init; } = TrainingModes.Games;

    /// <summary>Master games: an ECO prefix (<c>B9</c>, <c>B90</c>) or part of the opening's name.</summary>
    [QueryParam]
    public string? Eco { get; init; }

    /// <summary>Master games: <c>any</c>, <c>middlegame</c> or <c>endgame</c>.</summary>
    [QueryParam]
    public string Phase { get; init; } = TrainingPhases.Any;

    /// <summary>Master games: part of White's or Black's name.</summary>
    [QueryParam]
    public string? Player { get; init; }

    /// <summary>Master games: from this year.</summary>
    [QueryParam]
    public int? From { get; init; }

    /// <summary>Master games: up to this year.</summary>
    [QueryParam]
    public int? To { get; init; }

    /// <summary>The ids the session has shown, comma-separated (at most 100).</summary>
    [QueryParam]
    public string? Exclude { get; init; }

    public IReadOnlyList<string> ExcludeIds =>
        Exclude?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];

    public TrainingFilter Filter => new(Eco, Phase, Player, From, To);
}

internal sealed class NextTrainingRequestValidator : Validator<NextTrainingRequest>
{
    public NextTrainingRequestValidator()
    {
        RuleFor(r => r.Mode).MustBeMode();
        RuleFor(r => r.Phase).Must(TrainingPhases.IsPhase).WithMessage("Phase must be any, middlegame or endgame.");
        RuleFor(r => r.Eco).MaximumLength(100);
        RuleFor(r => r.Player).MaximumLength(100);
        RuleFor(r => r.From).InclusiveBetween(0, 3000);
        RuleFor(r => r.To).InclusiveBetween(0, 3000);
        RuleFor(r => r).Must(r => r.From is null || r.To is null || r.From <= r.To).WithName("from").WithMessage("From must not be after to.");
        RuleFor(r => r.ExcludeIds)
            .Must(ids => ids.Count <= TrainingIds.MaxExcluded)
            .WithName("exclude")
            .WithMessage($"At most {TrainingIds.MaxExcluded} ids may be excluded.");
        RuleFor(r => r)
            .Must(r => r.ExcludeIds.All(id => TrainingIds.IsValid(r.Mode, id)))
            .When(r => TrainingModes.IsMode(r.Mode))
            .WithName("exclude")
            .WithMessage("Every excluded id must be an id of the mode (g:{gameId}:{ply} or p:{positionId}).");
    }
}
