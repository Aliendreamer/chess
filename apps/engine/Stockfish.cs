using System.Diagnostics;
using System.Globalization;

namespace Chess.Engine;

/// <summary>A line-based conversation with a UCI engine process; the seam that lets the client be tested without a binary.</summary>
internal interface IUciChannel : IAsyncDisposable
{
    bool HasExited { get; }

    Task WriteLineAsync(string line, CancellationToken ct);

    /// <summary>The next line the engine printed, or null once its output has ended (the process exited).</summary>
    Task<string?> ReadLineAsync(CancellationToken ct);
}

/// <summary>A Stockfish process on stdin/stdout. Disposing asks it to quit, then kills it if it does not.</summary>
internal sealed class StockfishProcess : IUciChannel
{
    private readonly Process _process;

    private StockfishProcess(Process process) => _process = process;

    public bool HasExited => _process.HasExited;

    public static StockfishProcess Start(string path)
    {
        ProcessStartInfo info = new(path)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        return new StockfishProcess(Process.Start(info) ?? throw new InvalidOperationException($"Could not start the engine at {path}."));
    }

    public async Task WriteLineAsync(string line, CancellationToken ct)
    {
        await _process.StandardInput.WriteLineAsync(line.AsMemory(), ct).ConfigureAwait(false);
        await _process.StandardInput.FlushAsync(ct).ConfigureAwait(false);
    }

    public async Task<string?> ReadLineAsync(CancellationToken ct) =>
        await _process.StandardOutput.ReadLineAsync(ct).ConfigureAwait(false);

    public async ValueTask DisposeAsync()
    {
        if (!_process.HasExited)
        {
            try
            {
                await _process.StandardInput.WriteLineAsync("quit").ConfigureAwait(false);
                await _process.StandardInput.FlushAsync().ConfigureAwait(false);
                using CancellationTokenSource wait = new(TimeSpan.FromSeconds(2));
                await _process.WaitForExitAsync(wait.Token).ConfigureAwait(false);
            }
            catch (Exception e) when (e is IOException or OperationCanceledException)
            {
                _process.Kill(entireProcessTree: true);
            }
        }

        _process.Dispose();
    }
}

/// <summary>
/// A strength: an Elo the engine limits itself to (<c>UCI_LimitStrength</c> + <c>UCI_Elo</c>, 1320–3190 in
/// Stockfish 19), or full strength. Either way it thinks for the whole move time and only chooses a weaker move.
/// </summary>
internal readonly record struct EngineLevel(int? Elo)
{
    public const int MinElo = 1320;
    public const int MaxElo = 3190;

    public static EngineLevel Max => new(null);

    /// <summary><c>max</c>, or an Elo in the engine's range.</summary>
    public static bool TryParse(string? text, out EngineLevel level)
    {
        level = Max;
        if (string.Equals(text, "max", StringComparison.Ordinal))
        {
            return true;
        }

        if (int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out int elo) && elo is >= MinElo and <= MaxElo)
        {
            level = new EngineLevel(elo);
            return true;
        }

        return false;
    }

    /// <summary>The <c>setoption</c> lines that set this strength. Sent before every search, since a process serves every level.</summary>
    public IReadOnlyList<string> Options() => Elo is int elo
        ? ["setoption name UCI_LimitStrength value true", $"setoption name UCI_Elo value {elo.ToString(CultureInfo.InvariantCulture)}"]
        : ["setoption name UCI_LimitStrength value false", "setoption name Skill Level value 20"];

    public override string ToString() => Elo?.ToString(CultureInfo.InvariantCulture) ?? "max";
}

/// <summary>
/// The UCI conversation with one engine process: a handshake, then one search per request. Every wait has a deadline,
/// so a hung engine is reported (<see cref="TimeoutException"/>) instead of stalling its Kafka partition; an engine
/// that exits is reported as <see cref="EndOfStreamException"/>.
/// </summary>
internal sealed class UciEngine(IUciChannel channel, int hashMb, TimeSpan slack) : IAsyncDisposable
{
    private static readonly TimeSpan Handshake = TimeSpan.FromSeconds(10);

    public bool IsAlive => !channel.HasExited;

    public async Task InitializeAsync(CancellationToken ct)
    {
        await channel.WriteLineAsync("uci", ct).ConfigureAwait(false);
        await ExpectAsync("uciok", Handshake, ct).ConfigureAwait(false);
        await channel.WriteLineAsync("setoption name Threads value 1", ct).ConfigureAwait(false);
        await channel.WriteLineAsync($"setoption name Hash value {hashMb.ToString(CultureInfo.InvariantCulture)}", ct).ConfigureAwait(false);
        await ReadyAsync(ct).ConfigureAwait(false);
    }

    /// <summary>The engine's move in UCI notation after thinking <paramref name="thinkMs"/>, or null when it has none (the game is over).</summary>
    public async Task<string?> BestMoveAsync(string fen, EngineLevel level, int thinkMs, CancellationToken ct)
    {
        await channel.WriteLineAsync("ucinewgame", ct).ConfigureAwait(false);
        foreach (string option in level.Options())
        {
            await channel.WriteLineAsync(option, ct).ConfigureAwait(false);
        }

        await ReadyAsync(ct).ConfigureAwait(false);
        await channel.WriteLineAsync($"position fen {fen}", ct).ConfigureAwait(false);
        await channel.WriteLineAsync($"go movetime {thinkMs.ToString(CultureInfo.InvariantCulture)}", ct).ConfigureAwait(false);
        string line = await ExpectAsync("bestmove", TimeSpan.FromMilliseconds(thinkMs) + slack, ct).ConfigureAwait(false);
        string[] parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 && parts[1] != "(none)" ? parts[1] : null;
    }

    public ValueTask DisposeAsync() => channel.DisposeAsync();

    private async Task ReadyAsync(CancellationToken ct)
    {
        await channel.WriteLineAsync("isready", ct).ConfigureAwait(false);
        await ExpectAsync("readyok", Handshake, ct).ConfigureAwait(false);
    }

    /// <summary>Skips lines (<c>info …</c>) until one starts with <paramref name="prefix"/>.</summary>
    private async Task<string> ExpectAsync(string prefix, TimeSpan within, CancellationToken ct)
    {
        using CancellationTokenSource deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(within);
        try
        {
            while (true)
            {
                string line = await channel.ReadLineAsync(deadline.Token).ConfigureAwait(false)
                    ?? throw new EndOfStreamException($"The engine exited while waiting for '{prefix}'.");
                if (line.StartsWith(prefix, StringComparison.Ordinal))
                {
                    return line;
                }
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"The engine did not answer '{prefix}' within {within.TotalSeconds:0.#} s.");
        }
    }
}
