using Chess.Backend.Analysis;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Analysis;

/// <summary>
/// The shared evaluation cache (engine-analysis D2): answers what is known and asks the engine for the rest; the board
/// calls again for the positions it still waits for.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class AnalysePositionsEndpoint(IAnalysisService analysis, IOptions<AnalysisOptions> options)
    : Endpoint<AnalysePositionsRequest, AnalysePositionsResponse>
{
    public override void Configure()
    {
        Post("analysis");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Analysis")
            .Produces<AnalysePositionsResponse>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(AnalysePositionsRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        if (req.Positions.Count > options.Value.MaxPositions)
        {
            ThrowError(r => r.Positions, $"At most {options.Value.MaxPositions} positions per request.");
        }

        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        int thinkMs = options.Value.ThinkMs(req.Think)!.Value; // the validator allows only the three
        await Send.OkAsync(new AnalysePositionsResponse(req.Think, thinkMs, await analysis.AnalyseAsync(req.Positions, thinkMs, ct)), ct);
    }
}
