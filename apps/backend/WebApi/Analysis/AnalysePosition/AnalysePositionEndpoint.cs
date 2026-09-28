using Chess.Backend.Analysis;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Analysis;

/// <summary>
/// The shared evaluation cache (engine-analysis D2): answers the position when it is known and asks the engine
/// otherwise; the board calls again until the evaluation is there.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class AnalysePositionEndpoint(IAnalysisService analysis, IOptions<AnalysisOptions> options)
    : Endpoint<AnalysePositionRequest, AnalysePositionResponse>
{
    public override void Configure()
    {
        Post("analysis");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Analysis")
            .Produces<AnalysePositionResponse>()
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(AnalysePositionRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        int thinkMs = options.Value.ThinkMs(req.Think)!.Value; // the validator allows only the three
        PositionAnswer answer = await analysis.AnalyseAsync(req.Fen, thinkMs, ct);
        await Send.OkAsync(new AnalysePositionResponse(answer.Key, answer.Fen, req.Think, thinkMs, answer.Evaluation), ct);
    }
}
