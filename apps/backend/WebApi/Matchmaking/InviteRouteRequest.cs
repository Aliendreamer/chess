using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>The request of the invite endpoints that take only the route (<c>invites/{id}</c>).</summary>
internal sealed class InviteRouteRequest
{
    /// <summary>The invite id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class InviteRouteRequestValidator : Validator<InviteRouteRequest>
{
    public InviteRouteRequestValidator() => RuleFor(r => r.Id).MustBeInviteId();
}
