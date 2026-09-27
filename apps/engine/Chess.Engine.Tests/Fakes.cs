using System.Threading.Channels;

namespace Chess.Engine.Tests;

/// <summary>
/// A scripted UCI engine: each line written may queue replies (by default a well-behaved engine answering
/// <c>bestmove e2e4</c>). <see cref="Exit"/> ends its output the way a dying process does.
/// </summary>
internal sealed class FakeUci : IUciChannel
{
    private readonly Channel<string?> _output = Channel.CreateUnbounded<string?>();

    public List<string> Sent { get; } = [];

    public Func<string, IEnumerable<string>> Respond { get; set; } = Default;

    public bool HasExited { get; private set; }

    public bool Disposed { get; private set; }

    public static IEnumerable<string> Default(string line) => line switch
    {
        "uci" => ["id name Fake", "uciok"],
        "isready" => ["readyok"],
        _ when line.StartsWith("go ", StringComparison.Ordinal) => ["info depth 1 score cp 20", "bestmove e2e4 ponder e7e5"],
        _ => [],
    };

    public Task WriteLineAsync(string line, CancellationToken ct)
    {
        Sent.Add(line);
        foreach (string reply in Respond(line))
        {
            _output.Writer.TryWrite(reply);
        }

        return Task.CompletedTask;
    }

    public async Task<string?> ReadLineAsync(CancellationToken ct) => await _output.Reader.ReadAsync(ct);

    public void Exit()
    {
        HasExited = true;
        _output.Writer.TryWrite(null);
    }

    public ValueTask DisposeAsync()
    {
        Disposed = true;
        return ValueTask.CompletedTask;
    }
}

internal sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}
