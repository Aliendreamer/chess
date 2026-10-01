using Chess.Backend.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class CreateInviteRequest
{
    /// <summary>A preset, e.g. <c>5+3</c>, or <c>7d</c> for a correspondence game (a week per move).</summary>
    public string TimeControl { get; init; } = string.Empty;

    /// <summary><c>white</c>, <c>black</c> or <c>random</c>: the creator's colour.</summary>
    public string Color { get; init; } = SideNames.Random;
}

internal sealed class CreateInviteRequestValidator : Validator<CreateInviteRequest>
{
    public CreateInviteRequestValidator()
    {
        RuleFor(r => r.TimeControl).MustBeInviteTimeControl();
        RuleFor(r => r.Color).Must(SideNames.IsChoice).WithMessage("Colour must be white, black or random.");
    }
}
