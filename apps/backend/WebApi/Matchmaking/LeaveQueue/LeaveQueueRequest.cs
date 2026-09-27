namespace Chess.Backend.WebApi.Matchmaking;

internal sealed class LeaveQueueRequest
{
    /// <summary>A preset time control from the route, e.g. <c>5+3</c>.</summary>
    [BindFrom("tc")]
    public string TimeControl { get; init; } = string.Empty;
}

internal sealed class LeaveQueueRequestValidator : Validator<LeaveQueueRequest>
{
    public LeaveQueueRequestValidator() => RuleFor(r => r.TimeControl).MustBePreset();
}
