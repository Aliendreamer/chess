using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class ClaimRequest : IGameRoute
{
    /// <summary>The game id, from the route.</summary>
    public string Id { get; init; } = string.Empty;

    /// <summary><c>win</c> or <c>draw</c>.</summary>
    public string Outcome { get; init; } = string.Empty;
}

internal sealed class ClaimRequestValidator : Validator<ClaimRequest>
{
    public ClaimRequestValidator()
    {
        RuleFor(r => r.Id).MustBeGameId();
        RuleFor(r => r.Outcome).Must(o => GameReplyMapper.TryParseClaim(o, out _)).WithMessage("Outcome must be \"win\" or \"draw\".");
    }
}
