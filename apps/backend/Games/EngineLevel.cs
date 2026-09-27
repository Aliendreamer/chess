namespace Chess.Backend.Games;

/// <summary>
/// The engine's strengths, each a seeded player (engine-play D2): a <c>users</c> row with a fixed negative id (the
/// identity sequence only hands out positive ones) and an <c>engine:</c> sub that no Keycloak sub (a UUID) can match.
/// <see cref="Level"/> is what the engine worker understands: an Elo for <c>UCI_Elo</c>, or <c>max</c>.
/// </summary>
internal sealed record EngineLevel(string Level, long UserId, string Name)
{
    public static IReadOnlyList<EngineLevel> All { get; } =
    [
        new("1320", -1, "Stockfish 1320"),
        new("1600", -2, "Stockfish 1600"),
        new("2000", -3, "Stockfish 2000"),
        new("2400", -4, "Stockfish 2400"),
        new("max", -5, "Stockfish"),
    ];

    public string Sub => $"engine:{Level}";

    public static EngineLevel? Find(string? level) => All.FirstOrDefault(l => string.Equals(l.Level, level, StringComparison.Ordinal));
}
