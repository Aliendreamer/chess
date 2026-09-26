namespace Chess.Backend.Tests.Support;

/// <summary>HOCON for TestKit systems that persist: in-memory journal and snapshot store.</summary>
internal static class AkkaConfig
{
    public const string InMemoryPersistence = """
        akka.persistence.journal.plugin = "akka.persistence.journal.inmem"
        akka.persistence.snapshot-store.plugin = "akka.persistence.snapshot-store.inmem"
        """;

    /// <summary><see cref="InMemoryPersistence"/> plus Akka's virtual-time <c>TestScheduler</c>.</summary>
    public const string InMemoryPersistenceWithTestScheduler = InMemoryPersistence + """

        akka.scheduler.implementation = "Akka.TestKit.TestScheduler, Akka.TestKit"
        """;
}
