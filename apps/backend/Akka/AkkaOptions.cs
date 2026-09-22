namespace Chess.Backend.Akka;

internal sealed class AkkaOptions
{
    public const string SectionName = "Akka";
    public const string SystemName = "chess";
    public const string BackendRole = "backend";

    /// <summary>Hostname this node advertises to the cluster (container name in compose).</summary>
    public string Hostname { get; set; } = "localhost";

    public int Port { get; set; } = 8091;

    /// <summary>Static seed nodes; empty means "seed with myself" (single-node cluster).</summary>
    public string[] SeedNodes { get; set; } = [];

    public string[] Roles { get; set; } = [BackendRole];

    /// <summary>Number of shards per sharded entity type; changing it after data exists is a migration.</summary>
    public int ShardCount { get; set; } = 50;

    public string SelfAddress => $"akka.tcp://{SystemName}@{Hostname}:{Port}";

    public IReadOnlyList<string> EffectiveSeedNodes() => SeedNodes.Length == 0 ? [SelfAddress] : SeedNodes;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Hostname))
        {
            throw new InvalidOperationException("Akka:Hostname must be set.");
        }

        if (Port is <= 0 or > 65535)
        {
            throw new InvalidOperationException("Akka:Port must be 1-65535.");
        }

        foreach (string seed in SeedNodes)
        {
            if (!Uri.TryCreate(seed, UriKind.Absolute, out Uri? uri)
                || uri.Scheme != "akka.tcp"
                || uri.UserInfo != SystemName)
            {
                throw new InvalidOperationException($"Akka:SeedNodes entry '{seed}' must look like akka.tcp://{SystemName}@host:port.");
            }
        }
    }
}
