using Chess.Backend.Akka.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>What the remaining player claims when the opponent has gone (presence-and-abandonment D5).</summary>
internal static class ClaimOutcomes
{
    public const string Win = "win";
    public const string Draw = "draw";
}

/// <summary>Actor reply → HTTP: the one tested piece behind the thin game endpoints.</summary>
internal static class GameReplyMapper
{
    public static GameReplyOutcome Map(object reply) => reply switch
    {
        GameView view => new(true, StatusCodes.Status200OK, view, null),
        GameRejected r => new(false, r.Code switch
        {
            RejectionCode.Forbidden => StatusCodes.Status403Forbidden,
            RejectionCode.Illegal => StatusCodes.Status422UnprocessableEntity,
            RejectionCode.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status404NotFound,
        }, null, r.Reason),
        _ => new(false, StatusCodes.Status502BadGateway, null, "Unexpected reply from the game."),
    };

    /// <summary>A claim's outcome: <see cref="ClaimOutcomes.Win"/> or <see cref="ClaimOutcomes.Draw"/>, nothing else.</summary>
    public static bool TryParseClaim(string? outcome, out bool win)
    {
        win = outcome == ClaimOutcomes.Win;
        return outcome is ClaimOutcomes.Win or ClaimOutcomes.Draw;
    }

    /// <summary>
    /// Route ids (games, invites) are lower-case Guids in <c>N</c> form (32 hex, as live topics spell them) or <c>D</c>
    /// form (with dashes, as JSON responses spell them), so an id from a response can be pasted straight into a URL.
    /// </summary>
    public static bool TryParseId(string? text, out Guid id) =>
        (Guid.TryParseExact(text, "N", out id) && string.Equals(id.ToString("N"), text, StringComparison.Ordinal))
        || (Guid.TryParseExact(text, "D", out id) && string.Equals(id.ToString("D"), text, StringComparison.Ordinal));
}
