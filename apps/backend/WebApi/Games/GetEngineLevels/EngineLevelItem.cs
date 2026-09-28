namespace Chess.Backend.WebApi.Games;

/// <summary>One level: what to send as <c>level</c>, its short label, and the name the engine plays under.</summary>
internal sealed record EngineLevelItem(string Level, string Label, string Name);
