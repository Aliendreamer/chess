using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Chess.Backend.IntegrationTests.Fixtures;

/// <summary>
/// The real application — real endpoints, real actors, real projection — against the fixture's containers.
/// Only two things are faked: authentication (there is no Keycloak here) and the replica, which points at
/// the primary. Everything between the HTTP call and the row in <c>rm_pings</c> is production code.
/// </summary>
public sealed class PingApiFactory(StackFixture stack) : WebApplicationFactory<Program>
{
    public const string Subject = "it-subject";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Postgres", stack.PostgresConnectionString);
        builder.UseSetting("ConnectionStrings:PostgresReplica", stack.PostgresConnectionString);
        builder.UseSetting("ConnectionStrings:Redis", string.Empty);
        builder.UseSetting("Kafka:BootstrapServers", stack.BootstrapServers);
        builder.UseSetting("Akka:Hostname", "127.0.0.1");
        builder.UseSetting("Akka:Port", stack.AkkaPort.ToString(System.Globalization.CultureInfo.InvariantCulture));

        builder.ConfigureTestServices(services =>
        {
            // Replaces JwtBearer as the default scheme: the cookie→token resolver needs a live IdP, and
            // what these tests prove is the spine, not the login.
            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
        });
    }

    internal sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "IntegrationTest";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            Claim[] claims =
            [
                new(Utils.Constants.Claims.Subject, Subject),
                new(Utils.Constants.Claims.Email, "it@chess.localhost"),
                new(ClaimTypes.Role, Utils.Constants.Roles.User),
            ];
            ClaimsPrincipal principal = new(new ClaimsIdentity(claims, SchemeName, Utils.Constants.Claims.Subject, ClaimTypes.Role));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }
}
