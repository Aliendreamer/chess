using Chess.Backend.WebApi.Pings;

namespace Chess.Backend.Tests.Pings;

public sealed class PingPagingTests
{
    [Theory]
    [InlineData(1, 50, 0, 50)]
    [InlineData(0, 0, 0, 50)]
    [InlineData(3, 10, 20, 10)]
    [InlineData(1, 999, 0, 200)]
    public void Clamps_page_and_page_size(int page, int pageSize, int expectedSkip, int expectedTake)
    {
        (int skip, int take) = PingPaging.Page(page, pageSize);
        Assert.Equal(expectedSkip, skip);
        Assert.Equal(expectedTake, take);
    }
}
