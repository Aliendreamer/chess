using Chess.Backend.Analysis;

namespace Chess.Backend.WebApi.Analysis;

/// <summary>Each position asked about, in order, with its evaluation when one at this think time or longer is known.</summary>
internal sealed record AnalysePositionsResponse(string Think, int ThinkMs, IReadOnlyList<PositionAnswer> Positions);
