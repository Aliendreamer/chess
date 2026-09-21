using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Services;

public sealed class BaseServiceTests
{
    private sealed class Probe(ProjectDbContext db) : BaseService(db, NullLogger.Instance)
    {
        public static (int Skip, int Take) Call(int page, int size) => Page(page, size);
    }

    [Theory]
    [InlineData(1, 10, 0, 10)]
    [InlineData(3, 10, 20, 10)]
    [InlineData(0, 0, 0, BaseService.DefaultPageSize)]
    [InlineData(-5, 5, 0, 5)]
    [InlineData(2, 10_000, BaseService.MaxPageSize, BaseService.MaxPageSize)]
    public void Page_clamps_and_computes_skip(int page, int size, int skip, int take)
    {
        using ProjectDbContext db = TestDb.Create();
        _ = new Probe(db);
        Assert.Equal((skip, take), Probe.Call(page, size));
    }

    [Fact]
    public void Convention_registration_binds_each_IService_interface_to_its_implementation()
    {
        ServiceCollection services = new();
        Chess.Backend.Extensions.BuilderExtension.AddConventionServices(services);

        Assert.Contains(services, d => d.ServiceType == typeof(ISessionStore) && d.ImplementationType == typeof(SessionStore) && d.Lifetime == ServiceLifetime.Scoped);
        Assert.Contains(services, d => d.ServiceType == typeof(IUserProvisioningService) && d.ImplementationType == typeof(UserProvisioningService));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IService));
    }
}
