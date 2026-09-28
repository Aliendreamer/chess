namespace Chess.Backend.WebApi.Games;

/// <summary>The engine's levels, weakest first.</summary>
internal sealed record GetEngineLevelsResponse(IReadOnlyList<EngineLevelItem> Levels);
