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
    public void Options_default_group_prefix() => Assert.Equal("chess", new KafkaOptions().GroupPrefix);
}
