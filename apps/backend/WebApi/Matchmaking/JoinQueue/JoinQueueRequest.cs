namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class JoinQueueRequest
{
    /// <summary>A preset time control from the route, e.g. <c>5+3</c>.</summary>
    [BindFrom("tc")]
    public string TimeControl { get; init; } = string.Empty;

    /// <summary>True for the keep-alive a waiting client sends every ~25 s; only a heartbeat may learn a raced pairing.</summary>
    [QueryParam]
    public bool Heartbeat { get; init; }
}

internal sealed class JoinQueueRequestValidator : Validator<JoinQueueRequest>
{
    public JoinQueueRequestValidator() => RuleFor(r => r.TimeControl).MustBePreset();
}
