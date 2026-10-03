namespace Chess.Backend.WebApi.Library;

/// <summary>A library game at a position: who played it, when, how it ended, and after which ply it stood there.</summary>
internal sealed record PositionGame(Guid Id, string White, string Black, int? Year, string? Event, string Result, int Ply);

/// <summary>A move played from the position (library-explorer): how often, how it went, and the opening it reaches.</summary>
internal sealed record ExplorerMoveView(string Uci, int Games, int WhiteWins, int Draws, int BlackWins, string? Eco, string? Opening);

/// <summary>
/// How many library games reached a position and how they ended; the first 50 of them, newest year first; and the moves
/// played next, most played first (library-explorer).
/// </summary>
internal sealed record LibraryPositionView(
    int Games,
    int WhiteWins,
    int Draws,
    int BlackWins,
    IReadOnlyList<PositionGame> Items,
    IReadOnlyList<ExplorerMoveView> Moves);
