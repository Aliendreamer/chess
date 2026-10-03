namespace Chess.Backend.WebApi.Reviews;

/// <summary>How many of the player's mistakes were new to their practice.</summary>
internal sealed record PracticeFromGameResponse(int Added);
