namespace Chess.Engine;

/// <summary>Every log line of the worker, as source-generated methods (no boxing, CA1848/CA1873).</summary>
internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Engine worker started: {Processes} process(es) on {Topic}")]
    public static partial void WorkerStarted(ILogger logger, int processes, string topic);

    [LoggerMessage(Level = LogLevel.Information, Message = "Stockfish started from {Path}")]
    public static partial void EngineStarted(ILogger logger, string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Job}: {Uci} at level {Level}")]
    public static partial void Moved(ILogger logger, string job, string uci, string level);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Job}: depth {Depth}, {Lines} line(s)")]
    public static partial void Analysed(ILogger logger, string job, int depth, int lines);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An unreadable request was dropped")]
    public static partial void RequestUnreadable(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Job}: refused {What} / think {ThinkMs} ms")]
    public static partial void RequestRefused(ILogger logger, string job, string what, int thinkMs);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Job}: dropped a request {AgeSeconds} s old")]
    public static partial void RequestStale(ILogger logger, string job, long ageSeconds);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Job}: the engine has no move (game over)")]
    public static partial void NoMove(ILogger logger, string job);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Job}: the engine failed; restarting it and trying again")]
    public static partial void EngineRestarting(ILogger logger, Exception exception, string job);

    [LoggerMessage(Level = LogLevel.Error, Message = "{Job}: the engine failed twice; the request is dropped")]
    public static partial void EngineGaveUp(ILogger logger, Exception exception, string job);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Kafka failed; reading the request again shortly")]
    public static partial void KafkaFailed(ILogger logger, Exception exception);
}
