using Chess.Backend.News;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.News;

/// <summary>The enabled news sources, for the news page's filter (chess-news).</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListSourcesEndpoint(NewsOptions news) : EndpointWithoutRequest<IReadOnlyList<NewsSourceView>>
{
    public override void Configure()
    {
        Get("news/sources");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("News").Produces<IReadOnlyList<NewsSourceView>>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = NewsHttp.CacheControl;
        return Send.OkAsync([.. news.Feeds.Where(f => f.Enabled).Select(f => new NewsSourceView(f.Id, f.Name))], ct);
    }
}
