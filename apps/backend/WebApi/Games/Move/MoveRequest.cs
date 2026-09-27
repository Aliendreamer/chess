using System.Text.RegularExpressions;
using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class MoveRequest : IGameRoute
{
    /// <summary>The game id, from the route.</summary>
    public string Id { get; init; } = string.Empty;

    /// <summary>UCI, e.g. <c>e2e4</c> or <c>e7e8q</c>.</summary>
    public string Uci { get; init; } = string.Empty;
}

/// <summary>The shape of a move only; whether it is legal is the game's call (422).</summary>
internal sealed partial class MoveRequestValidator : Validator<MoveRequest>
{
    public MoveRequestValidator()
    {
        RuleFor(r => r.Id).MustBeGameId();
        RuleFor(r => r.Uci).Matches(Uci()).WithMessage("A move is UCI: two squares and an optional promotion piece (e2e4, e7e8q).");
    }

    [GeneratedRegex("^[a-h][1-8][a-h][1-8][nbrq]?$")]
    private static partial Regex Uci();
}
