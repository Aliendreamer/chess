namespace Chess.Backend.WebApi.Library;

/// <summary>A library game to open on the analysis board: its headers, source and licence, and its moves (UCI).</summary>
internal sealed record LibraryGameView(LibraryGameItem Game, IReadOnlyList<string> Moves, string? SourceRef);
