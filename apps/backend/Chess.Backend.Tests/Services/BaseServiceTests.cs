using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Services;

public sealed class BaseServiceTests
{
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
