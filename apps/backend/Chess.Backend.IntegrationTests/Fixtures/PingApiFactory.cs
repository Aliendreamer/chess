using System.Diagnostics;
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
public sealed class PingApiFactory : WebApplicationFactory<Program>
{
    public const string Subject = "it-subject";

    /// <summary>
    /// Deliberately NOT "Development": that environment's appsettings hard-codes localhost connection
    /// strings, and <c>AddSharedConfiguration</c> layers the json files on top of the web host builder's
    /// settings, so <c>UseSetting</c> loses to them. Under an environment with no appsettings file of its
    /// own only the base file applies, where every connection string is empty — the fixture's env vars
    /// then decide, and Redis stays off (L1 cache, in-memory rate limiter).
    /// </summary>
    public const string EnvironmentName = "IntegrationTest";

    private static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(90);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment(EnvironmentName);
        builder.ConfigureTestServices(services =>
        {
            // Replaces JwtBearer as the default scheme: the cookie→token resolver needs a live IdP, and
            // what these tests prove is the spine, not the login.
            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
        });
    }

    /// <summary>
    /// A client that will not command an actor before the node can serve one. <c>/health</c> covers the
    /// primary, the replica, Kafka and — the one that matters here — <c>akka-cluster</c>, which is healthy
    /// only once this node's member is Up and the shard region can allocate. Commanding earlier means the
    /// region buffers the ask and the endpoint's 5s timeout turns it into a 504.
    /// </summary>
    public async Task<HttpClient> CreateReadyClientAsync(CancellationToken ct)
    {
        HttpClient client = CreateClient();
        Stopwatch elapsed = Stopwatch.StartNew();
        string last = "no response";
        while (elapsed.Elapsed < ReadyTimeout)
        {
            try
            {
                using HttpResponseMessage health = await client.GetAsync(new Uri("/health", UriKind.Relative), ct);
                if (health.IsSuccessStatusCode)
                {
                    return client;
                }

                last = $"{(int)health.StatusCode} {await health.Content.ReadAsStringAsync(ct)}";
            }
            catch (HttpRequestException e)
            {
                last = e.Message;
            }

            // 500ms, not tighter: TestServer has no remote IP, so every request lands in the rate
            // limiter's single "anonymous" partition (300/min) alongside the projection polling.
            await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
        }

        client.Dispose();
        throw new TimeoutException($"node not healthy within {ReadyTimeout.TotalSeconds:F0}s; last /health: {last}");
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
