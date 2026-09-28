using Chess.Backend.Analysis;

namespace Chess.Backend.WebApi.Analysis;

/// <summary>The position asked about, with its evaluation when one at this think time or longer is known.</summary>
internal sealed record AnalysePositionResponse(string Key, string Fen, string Think, int ThinkMs, Evaluation? Evaluation);
