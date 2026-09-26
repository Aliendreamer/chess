using Akka.Actor;
using Akka.Hosting;

namespace Chess.Backend.Tests.Support;

/// <summary>An <see cref="IRequiredActor{TActor}"/> that always answers with the given ref (usually a probe).</summary>
internal sealed class FixedRegion<TActor>(IActorRef actorRef) : IRequiredActor<TActor>
{
    public IActorRef ActorRef { get; } = actorRef;

    public Task<IActorRef> GetAsync(CancellationToken cancellationToken = default) => Task.FromResult(ActorRef);
}
