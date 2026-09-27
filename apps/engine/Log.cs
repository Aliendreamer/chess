namespace Chess.Engine;

/// <summary>Every log line of the worker, as source-generated methods (no boxing, CA1848/CA1873).</summary>
internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Engine worker started: {Processes} process(es) on {Topic}")]
    public static partial void WorkerStarted(ILogger logger, int processes, string topic);

    [LoggerMessage(Level = LogLevel.Information, Message = "Stockfish started from {Path}")]
    public static partial void EngineStarted(ILogger logger, string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "{GameId}#{Ply}: {Uci} at level {Level}")]
    public static partial void Moved(ILogger logger, string gameId, int ply, string uci, string level);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An unreadable move request was dropped")]
    public static partial void RequestUnreadable(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{GameId}#{Ply}: refused level {Level} / think {ThinkMs} ms")]
    public static partial void RequestRefused(ILogger logger, string gameId, int ply, string level, int thinkMs);

    [LoggerMessage(Level = LogLevel.Information, Message = "{GameId}#{Ply}: dropped a request {AgeSeconds} s old")]
    public static partial void RequestStale(ILogger logger, string gameId, int ply, long ageSeconds);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{GameId}#{Ply}: the engine has no move (game over)")]
    public static partial void NoMove(ILogger logger, string gameId, int ply);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{GameId}#{Ply}: the engine failed; restarting it and trying again")]
    public static partial void EngineRestarting(ILogger logger, Exception exception, string gameId, int ply);

    [LoggerMessage(Level = LogLevel.Error, Message = "{GameId}#{Ply}: the engine failed twice; the request is dropped")]
    public static partial void EngineGaveUp(ILogger logger, Exception exception, string gameId, int ply);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Kafka failed; reading the request again shortly")]
    public static partial void KafkaFailed(ILogger logger, Exception exception);
}
