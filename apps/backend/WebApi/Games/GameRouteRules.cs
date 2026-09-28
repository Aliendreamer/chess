using Chess.Backend.Akka.Games;
using Chess.Backend.Extensions;
using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal static class GameRouteRules
{
    public static IRuleBuilderOptions<T, string> MustBeGameId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Game id must be a lower-case Guid, with or without dashes.");
}
