using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>The shared rules of the matchmaking requests.</summary>
internal static class MatchmakingRules
{
    public static IRuleBuilderOptions<T, string> MustBePreset<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(tc => Chess.Backend.Games.TimeControl.TryParse(tc, out _)).WithMessage("Not a preset time control (e.g. 5+3).");

    public static IRuleBuilderOptions<T, string> MustBeInviteTimeControl<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(tc => Chess.Backend.Games.TimeControl.TryParseInvite(tc, out _)).WithMessage("Not a preset time control (e.g. 5+3) or 7d.");

    public static IRuleBuilderOptions<T, string> MustBeInviteId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Invite id must be a lower-case Guid, with or without dashes.");
}
