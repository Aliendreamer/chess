using Chess.Backend.Extensions;
using Chess.Backend.News;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.News;

/// <summary>Chess news headlines, newest first (chess-news): titles and links to the sources, never the articles.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListNewsEndpoint(ReadDbContext read, NewsOptions news, IOptions<ApiOptions> options) : Endpoint<ListNewsRequest, CursorPage<NewsItemView>>
{
    public override void Configure()
    {
        Get("news");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("News")
            .Produces<CursorPage<NewsItemView>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(ListNewsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = NewsHttp.CacheControl;
        (DateTimeOffset At, Guid Id)? after = KeysetCursor.TryDecodeGuid(req.Cursor, out KeysetCursor c, out Guid id) ? (c.At, id) : null;
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        Dictionary<string, string> names = news.Feeds.ToDictionary(f => f.Id, f => f.Name, StringComparer.Ordinal);
        try
        {
            IQueryable<NewsItem> items = read.NewsItems;
            if (req.Source is { } source)
            {
                items = items.Where(n => n.Source == source);
            }

            List<NewsItem> rows = await items.NewestFirst(n => n.PublishedAt, n => n.Id, after, limit).ToListAsync(ct);
            List<NewsItemView> views = rows.ConvertAll(n => new NewsItemView(n.Id, n.Source, names.GetValueOrDefault(n.Source, n.Source), n.Title, n.Url, n.PublishedAt));
            await Send.OkAsync(Keyset.ToPage(views, limit, v => new KeysetCursor(v.PublishedAt, v.Id.ToString())), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
