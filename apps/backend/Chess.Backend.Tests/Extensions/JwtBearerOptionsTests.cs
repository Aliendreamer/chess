using Chess.Backend.Extensions;
using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace Chess.Backend.Tests.Extensions;

public sealed class JwtBearerOptionsTests
{
    private static JwtBearerOptions Configure(string audience)
    {
        JwtBearerOptions options = new();
        BuilderExtension.ConfigureJwtBearer(
            options,
            new KeycloakOptions { Authority = "http://keycloak.chess.localhost/realms/chess", Audience = audience },
            isDevelopment: true);
        return options;
    }

    [Fact]
    public void A_configured_audience_is_enforced()
    {
        JwtBearerOptions options = Configure("chess_api");

        Assert.True(options.TokenValidationParameters.ValidateAudience);
        Assert.Equal("chess_api", options.Audience);
        Assert.True(options.TokenValidationParameters.ValidateIssuer);
        Assert.Equal("http://keycloak.chess.localhost/realms/chess", options.TokenValidationParameters.ValidIssuer);
    }

    [Fact]
    public void An_empty_audience_is_not_validated()
    {
        // Only the IntegrationTest environment runs like this (test auth scheme, no Keycloak).
        JwtBearerOptions options = Configure(string.Empty);

        Assert.False(options.TokenValidationParameters.ValidateAudience);
        Assert.Null(options.Audience);
    }

    [Fact]
    public void Every_deployed_environment_sets_the_chess_api_audience()
    {
        foreach (string env in new[] { "Development", "Production" })
        {
            string json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Config", $"appsettings.{env}.json"));
            using System.Text.Json.JsonDocument doc = System.Text.Json.JsonDocument.Parse(json);
            Assert.Equal("chess_api", doc.RootElement.GetProperty("Keycloak").GetProperty("Audience").GetString());
        }
    }
}
