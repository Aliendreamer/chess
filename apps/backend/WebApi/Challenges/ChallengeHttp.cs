using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Presence;
using Chess.Backend.Extensions;
using Chess.Backend.WebApi.Games;
using Chess.Backend.WebApi.Matchmaking;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Challenges;

/// <summary>Challenge refusals → the words a member reads (club-members D2): the tested piece behind the endpoints.</summary>
internal static class ChallengeHttp
{
    public const string Yourself = "You cannot challenge yourself.";
    public const string NoSuchMember = "No such member.";

    public static string Refusal(ChallengeRefusal reason, string opponent) => reason switch
    {
        ChallengeRefusal.Self => Yourself,
        ChallengeRefusal.Offline => $"{opponent} is offline.",
        ChallengeRefusal.Playing => $"{opponent} is playing.",
        ChallengeRefusal.AlreadyChallenged => $"{opponent} already has a challenge.",
        ChallengeRefusal.ChallengeOut => "You already have a challenge out.",
        _ => throw new ArgumentOutOfRangeException(nameof(reason), reason, null),
    };
}

/// <summary>A request that names a challenge in its route (<c>challenges/{id}</c>).</summary>
internal sealed class ChallengeRouteRequest
{
    /// <summary>The challenge (invite) id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class ChallengeRouteRequestValidator : Validator<ChallengeRouteRequest>
{
    public ChallengeRouteRequestValidator() =>
        RuleFor(r => r.Id).Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Challenge id must be a lower-case Guid, with or without dashes.");
}

/// <summary>
/// Accept, decline and cancel: ask the invite, answer its post-persist view (live on <c>invite:{id}</c> too). Accepting
/// starts the game, so every ask gets <see cref="ApiOptions.InviteAskTimeout"/>. Nothing here may be cached.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class ChallengeEndpointBase(IRequiredActor<InviteActor> invites, IOptions<ApiOptions> options)
    : Endpoint<ChallengeRouteRequest, InviteView>
{
    protected void Standard(string route)
    {
        Post(route);
        Policies(Constants.Policies.SignedIn);
        Description(d => d.ClearDefaultAccepts() // route only: a body-less POST must not be a 415
            .WithTags("Challenges")
            .Produces<InviteView>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status504GatewayTimeout));
    }

    protected async Task AskAsync(ChallengeRouteRequest req, Func<Guid, object> command, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (!GameReplyMapper.TryParseId(req.Id, out Guid id))
        {
            ThrowError("Challenge id must be a lower-case Guid, with or without dashes.", StatusCodes.Status400BadRequest);
        }

        object reply;
        try
        {
            reply = await invites.ActorRef.Ask(ActorTracing.Wrap(command(id)), options.Value.InviteAskTimeout, ct);
        }
        catch (AskTimeoutException)
        {
            ThrowError("The challenge did not respond in time.", StatusCodes.Status504GatewayTimeout);
            return;
        }

        (int status, object? body, string? error) = InviteHttp.Map(reply);
        if (body is InviteView view)
        {
            await Send.OkAsync(view, ct);
            return;
        }

        ThrowError(error!, status);
    }
}
