namespace Chess.Backend.WebApi.Library;

/// <summary>A named opening position: its ECO code and name (lichess <c>chess-openings</c>, CC0).</summary>
internal sealed record OpeningView(string Eco, string Name);
