namespace Chess.Backend.Live;

/// <summary>
/// The one unit of live state on the wire (DistributedPubSub → hub → relay → browser). <see cref="Topic"/> is
/// <c>"{kind}:{id}"</c>, <see cref="Seq"/> is the aggregate's journal sequence (the browser drops anything not newer
/// than what it shows), and <see cref="Payload"/> is kind-specific. Nothing between the actor and the browser reads it.
/// </summary>
internal sealed record LiveFrame(string Topic, long Seq, object Payload);

internal static class LiveTopics
{
    /// <summary>DistributedPubSub topic every live aggregate publishes its frames to.</summary>
    public const string PubSub = "live";

    /// <summary>SignalR client method a pushed frame arrives on.</summary>
    public const string FrameMethod = "frame";

    public static string Format(string kind, string id) => $"{kind}:{id}";

    /// <summary>Splits on the first ':'; both halves must be non-empty. Id rules are the kind's business.</summary>
    public static bool TryParse(string? topic, out string kind, out string id)
    {
        kind = id = string.Empty;
        int colon = topic?.IndexOf(':', StringComparison.Ordinal) ?? -1;
        if (topic is null || colon <= 0 || colon == topic.Length - 1)
        {
            return false;
        }

        (kind, id) = (topic[..colon], topic[(colon + 1)..]);
        return true;
    }
}

/// <summary>One per live kind (ping now, game in Part 1): validates ids and supplies the current state on subscribe.</summary>
internal interface ILiveTopicSource
{
    string Kind { get; }

    bool IsValidId(string id);

    /// <summary>The aggregate's current frame, or null when there is nothing to show yet.</summary>
    Task<LiveFrame?> SnapshotAsync(string id, CancellationToken ct);
}

/// <summary>Maps a topic to its kind's source; a topic with an unknown kind or an invalid id resolves to nothing.</summary>
internal sealed class LiveTopicResolver
{
    private readonly Dictionary<string, ILiveTopicSource> _byKind;

    public LiveTopicResolver(IEnumerable<ILiveTopicSource> sources)
    {
        ArgumentNullException.ThrowIfNull(sources);
        _byKind = new Dictionary<string, ILiveTopicSource>(StringComparer.Ordinal);
        foreach (ILiveTopicSource source in sources)
        {
            if (!_byKind.TryAdd(source.Kind, source))
            {
                throw new InvalidOperationException($"Two live sources registered for kind '{source.Kind}'.");
            }
        }
    }

    public bool TryResolve(string? topic, [NotNullWhen(true)] out ILiveTopicSource? source, out string id)
    {
        source = null;
        if (!LiveTopics.TryParse(topic, out string kind, out id)
            || !_byKind.TryGetValue(kind, out ILiveTopicSource? found)
            || !found.IsValidId(id))
        {
            return false;
        }

        source = found;
        return true;
    }
}
