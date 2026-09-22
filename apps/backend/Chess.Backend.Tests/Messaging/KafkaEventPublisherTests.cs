using Chess.Backend.Messaging;
using Confluent.Kafka;

namespace Chess.Backend.Tests.Messaging;

public sealed class KafkaEventPublisherTests
{
    [Fact]
    public async Task Produces_key_and_value_to_the_topic()
    {
        Mock<IProducer<string, string>> producer = new();
        producer.Setup(p => p.ProduceAsync("t", It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DeliveryResult<string, string> { Status = PersistenceStatus.Persisted });
        KafkaEventPublisher publisher = new(producer.Object);

        await publisher.PublishAsync("t", "k", "{}", CancellationToken.None);

        producer.Verify(p => p.ProduceAsync("t", It.Is<Message<string, string>>(m => m.Key == "k" && m.Value == "{}"), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Rejects_an_empty_topic_or_key_before_touching_the_producer()
    {
        Mock<IProducer<string, string>> producer = new(MockBehavior.Strict);
        KafkaEventPublisher publisher = new(producer.Object);

        await Assert.ThrowsAsync<ArgumentException>(() => publisher.PublishAsync(string.Empty, "k", "{}", CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() => publisher.PublishAsync("t", string.Empty, "{}", CancellationToken.None));
        producer.VerifyNoOtherCalls();
    }

    [Fact]
    public void Dispose_flushes_before_closing_so_queued_events_are_not_dropped()
    {
        Mock<IProducer<string, string>> producer = new();
        KafkaEventPublisher publisher = new(producer.Object);

        publisher.Dispose();

        producer.Verify(p => p.Flush(It.IsAny<TimeSpan>()), Times.Once);
        producer.Verify(p => p.Dispose(), Times.Once);
    }

    [Fact]
    public void Creating_a_producer_needs_options() =>
        Assert.Throws<ArgumentNullException>(() => KafkaEventPublisher.CreateProducer(null!));

    [Fact]
    public void Options_default_group_prefix() => Assert.Equal("chess", new KafkaOptions().GroupPrefix);
}
