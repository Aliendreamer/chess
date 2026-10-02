namespace Chess.Backend.WebApi.Library;

/// <summary>A library game at a position: who played it, when, how it ended, and after which ply it stood there.</summary>
internal sealed record PositionGame(Guid Id, string White, string Black, int? Year, string? Event, string Result, int Ply);

/// <summary>How many library games reached a position and how they ended; the first 50 of them, newest year first.</summary>
internal sealed record LibraryPositionView(int Games, int WhiteWins, int Draws, int BlackWins, IReadOnlyList<PositionGame> Items);
