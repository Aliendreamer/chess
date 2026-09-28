using Chess.Backend.Akka.Games;
using Chess.Backend.Extensions;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>The request of every game endpoint that takes only the route.</summary>
internal sealed class GameRouteRequest : IGameRoute
{
    /// <summary>The game id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class GameRouteRequestValidator : Validator<GameRouteRequest>
{
    public GameRouteRequestValidator() => RuleFor(r => r.Id).MustBeGameId();
}
