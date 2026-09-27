namespace Chess.Backend.WebApi.Games;

/// <summary>The engine's levels, weakest first.</summary>
internal sealed record GetEngineLevelsResponse(IReadOnlyList<EngineLevelItem> Levels);

/// <summary>One level: what to send as <c>level</c>, and the name the engine plays under.</summary>
internal sealed record EngineLevelItem(string Level, string Name);
