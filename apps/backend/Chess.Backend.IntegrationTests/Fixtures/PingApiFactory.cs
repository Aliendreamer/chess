using System.Diagnostics;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Chess.Backend.IntegrationTests.Fixtures;

/// <summary>
/// The real application — real endpoints, real actors, real projection — against the fixture's containers.
/// Only two things are faked: authentication (there is no Keycloak here) and the replica, which points at
/// the primary. Everything between the HTTP call and the row in <c>rm_pings</c> is production code.
/// </summary>
public sealed class PingApiFactory(Action<IServiceCollection>? configureServices = null) : WebApplicationFactory<Program>
{
    public const string Subject = "it-subject";

    /// <summary>Comma-separated extra realm roles for one request, e.g. <c>Admin</c>; absent means a plain User.</summary>
    public const string RolesHeader = "X-Test-Roles";

    /// <summary>Acts as another user for one request (JIT-provisioned like a real login); absent means <see cref="Subject"/>.</summary>
    public const string SubjectHeader = "X-Test-Subject";

    /// <summary>
    /// Deliberately NOT "Development": that environment's appsettings hard-codes localhost connection
    /// strings, and <c>AddSharedConfiguration</c> layers the json files on top of the web host builder's
    /// settings, so <c>UseSetting</c> loses to them. Under an environment with no appsettings file of its
    /// own only the base file applies, where every connection string is empty — the fixture's env vars
    /// then decide, and Redis stays off (L1 cache, in-memory rate limiter).
    /// </summary>
    public const string EnvironmentName = "IntegrationTest";

    private static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(90);

    /// <summary>
    /// Startup failures must name themselves. A hosted service that throws in <c>StartAsync</c> — the Akka
    /// system or the Kafka consumer — fails host start, and <c>RunAsync</c>'s finally disposes the host; the
    /// test then sees only <c>ObjectDisposedException: TestServer</c> from its first request, which says
    /// nothing about the cause. Catching it here keeps the real exception attached to the test.
    /// </summary>
    protected override IHost CreateHost(IHostBuilder builder)
    {
        try
        {
            return base.CreateHost(builder);
        }
        catch (Exception e)
        {
            throw new InvalidOperationException($"the API host did not start: {e}", e);
        }
    }

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
            configureServices?.Invoke(services);
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
            catch (ObjectDisposedException e)
            {
                // The host started and then tore itself down — almost always a hosted service failing
                // after the server was created. Whatever logged first in the app output is the cause.
                throw new InvalidOperationException(
                    "the API host was disposed while starting; check the application log for the first error "
                    + "(run: dotnet test Chess.Backend.IntegrationTests -l \"console;verbosity=detailed\")",
                    e);
            }

            // 500ms, not tighter: TestServer has no remote IP, so every request lands in the rate
            // limiter's single "anonymous" partition (300/min) alongside the projection polling.
            await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
        }

        client.Dispose();
        throw new TimeoutException($"node not healthy within {ReadyTimeout.TotalSeconds:F0}s; last /health: {last}");
    }

    /// <summary>
    /// A SignalR client on the live hub, as the BFF would be; <paramref name="roles"/> are extra realm roles
    /// (<c>Relay</c> to get in), null for a plain user. Long polling: TestServer has no socket to upgrade, so it
    /// runs over the in-memory handler.
    /// </summary>
    public HubConnection ConnectHub(string? roles) =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(Server.BaseAddress, "hub/live"), o =>
            {
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => Server.CreateHandler();
                if (roles is not null)
                {
                    o.Headers[RolesHeader] = roles;
                }
            })
            .Build();

    internal sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "IntegrationTest";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            string subject = Request.Headers[SubjectHeader].ToString() is { Length: > 0 } s ? s : Subject;
            List<Claim> claims =
            [
                new(Utils.Constants.Claims.Subject, subject),
                new(Utils.Constants.Claims.Email, $"{subject}@chess.localhost"),
                new(Utils.Constants.Claims.PreferredUsername, subject), // Keycloak sends it; it becomes users.Username (D23)
                new(ClaimTypes.Role, Utils.Constants.Roles.User),
            ];
            foreach (string role in Request.Headers[RolesHeader].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }

            ClaimsPrincipal principal = new(new ClaimsIdentity(claims, SchemeName, Utils.Constants.Claims.Subject, ClaimTypes.Role));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }
}
