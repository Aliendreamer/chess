using Chess.Backend.Games;
using Chess.Backend.WebApi.Matchmaking;
using FluentValidation;

namespace Chess.Backend.WebApi.Challenges;

internal sealed class CreateChallengeRequest
{
    /// <summary>The member challenged (users.id).</summary>
    public long OpponentId { get; init; }

    /// <summary>A preset time control, e.g. <c>5+3</c>.</summary>
    public string TimeControl { get; init; } = string.Empty;

    /// <summary>The challenger's colour: <c>white</c>, <c>black</c> or <c>random</c>.</summary>
    public string Color { get; init; } = string.Empty;
}

internal sealed class CreateChallengeRequestValidator : Validator<CreateChallengeRequest>
{
    public CreateChallengeRequestValidator()
    {
        RuleFor(r => r.OpponentId).GreaterThan(0).WithMessage("Name a member to challenge.");
        RuleFor(r => r.TimeControl).MustBePreset();
        RuleFor(r => r.Color).Must(SideNames.IsChoice).WithMessage("Colour must be white, black or random.");
    }
}
