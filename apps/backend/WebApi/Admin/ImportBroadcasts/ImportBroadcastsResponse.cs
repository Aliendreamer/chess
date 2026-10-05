namespace Chess.Backend.WebApi.Admin;

/// <summary>The run that was started; its progress is in the runs list.</summary>
internal sealed record ImportBroadcastsResponse(Guid RunId);
