namespace Chess.Backend.Projections;

internal interface IProjection
{
    string Topic { get; }

    string GroupId { get; }

    /// <summary>Must be idempotent: the same event may arrive again after a crash before commit.</summary>
    Task ApplyAsync(string key, string json, CancellationToken ct);
}
