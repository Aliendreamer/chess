using Chess.Backend.News;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.News;

/// <summary>
/// The tournaments being played now (chess-news D6): the top <c>News:EventsShown</c> — live rounds first, then the most
/// important, then the earliest — or none when the snapshot is older than an hour (lichess unreachable).
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class ListEventsEndpoint(ReadDbContext read, NewsOptions news, TimeProvider clock) : EndpointWithoutRequest<IReadOnlyList<ChessEventView>>
{
    public override void Configure()
    {
        Get("news/events");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("News")
            .Produces<IReadOnlyList<ChessEventView>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = NewsHttp.CacheControl;
        DateTimeOffset freshFrom = clock.GetUtcNow() - NewsHttp.EventsStaleAfter;
        try
        {
            List<ChessEvent> events = await read.ChessEvents.Where(e => e.FetchedAt >= freshFrom).ToListAsync(ct);
            await Send.OkAsync(
                [.. BroadcastParser.Shown(events, news.EventsShown).Select(e => new ChessEventView(
                    e.Id, e.Name, e.Url, e.RoundName, e.RoundUrl, e.Ongoing, e.Location, e.FideTc, e.StartsAt, e.EndsAt))],
                ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
