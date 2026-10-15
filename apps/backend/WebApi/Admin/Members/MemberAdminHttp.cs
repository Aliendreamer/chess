using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Admin;

/// <summary>A request that names a member in its route (<c>admin/members/{id}</c>).</summary>
internal sealed class MemberRouteRequest
{
    public long Id { get; init; }
}

internal sealed class MemberRouteRequestValidator : Validator<MemberRouteRequest>
{
    public MemberRouteRequestValidator() => RuleFor(r => r.Id).GreaterThan(0).WithMessage("Member id must be positive.");
}

/// <summary>The Admin's members list.</summary>
internal sealed record ListAdminMembersResponse(IReadOnlyList<AdminMemberItem> Items);

/// <summary>
/// The member admin endpoints' shared plumbing (member-admin D3): Admin only, never cached, and an
/// <see cref="AdminResult{T}"/> answered as its value or as its status with its words.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class MemberAdminEndpointBase<TRequest, TResponse> : Endpoint<TRequest, TResponse>
    where TRequest : notnull
    where TResponse : class
{
    protected void Standard(string route, Http verb, bool bodyless)
    {
        Verbs(verb);
        Routes(route);
        Roles(Constants.Roles.Admin);
        Description(d =>
        {
            if (bodyless)
            {
                d.ClearDefaultAccepts(); // route only: a body-less POST must not be a 415
            }

            d.WithTags("Admin")
                .Produces<TResponse>()
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict)
                .Produces(StatusCodes.Status502BadGateway);
        });
    }

    protected async Task AnswerAsync<T>(AdminResult<T> result, Func<T, TResponse> body, CancellationToken ct)
        where T : class
    {
        ArgumentNullException.ThrowIfNull(result);
        ArgumentNullException.ThrowIfNull(body);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (result.Value is { } value)
        {
            await Send.OkAsync(body(value), ct);
            return;
        }

        ThrowError(result.Error ?? "The member could not be changed.", result.Status);
    }
}
