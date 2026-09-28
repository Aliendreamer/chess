using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.WebApi.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>Invite replies → HTTP. An invalid colour or time control is the request's fault: 400, not 422.</summary>
internal static class InviteHttp
{
    public static (int Status, object? Body, string? Error) Map(object reply) => reply switch
    {
        InviteView view => (StatusCodes.Status200OK, view, null),
        InviteRejected r => (r.Code switch
        {
            RejectionCode.Forbidden => StatusCodes.Status403Forbidden,
            RejectionCode.Illegal => StatusCodes.Status400BadRequest,
            RejectionCode.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status404NotFound,
        }, null, r.Reason),
        _ => (StatusCodes.Status502BadGateway, null, "Unexpected reply."),
    };
}
