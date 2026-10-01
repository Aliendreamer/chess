namespace Chess.Backend.Utils;

internal static class Constants
{
    public const string RoutePrefix = "api";
    public const string ServiceName = "chess-backend";
    public const string CorsPolicy = "AppOrigins";
    public const string KeycloakHttpClient = "keycloak";
    public const string HealthPath = "/health";

    /// <summary><c>Cache-Control</c> values: <see cref="NoStore"/> for live and command answers, the other for a finished game.</summary>
    public static class CacheControl
    {
        public const string NoStore = "no-store";
        public const string ImmutablePrivate = "private, max-age=86400, immutable";
    }

    /// <summary>The <c>ConnectionStrings</c> names (env: <c>ConnectionStrings__Postgres</c>).</summary>
    public static class ConnectionStrings
    {
        public const string Postgres = "Postgres";
        public const string PostgresReplica = "PostgresReplica";

        /// <summary>Set = Redis is the cache's L2 and backplane and the rate limiter's store; unset = in-memory.</summary>
        public const string Redis = "Redis";
    }

    /// <summary>Configuration read without an options class.</summary>
    public static class ConfigKeys
    {
        public const string AllowedCorsOrigins = "AllowedCorsOrigins";
        public const string ForwardedHeaders = "ForwardedHeaders";
        public const string AkkaHostname = "Akka:Hostname";
    }

    /// <summary>The checks <c>/health</c> reports by name (the verify scripts read them).</summary>
    public static class HealthChecks
    {
        public const string Postgres = "postgres";
        public const string PostgresReplica = "postgres-replica";
        public const string Redis = "redis";
        public const string AkkaCluster = "akka-cluster";
        public const string ProjectionDeadLetters = "projection-dead-letters";
        public const string Kafka = "kafka";
        public const string JournalPublisher = "journal-publisher";
    }

    public static class Cookies
    {
        public const string DefaultSessionName = "mp_sid";
        public const string DefaultPkceName = "mp_pkce";
    }

    public static class Routes
    {
        public const string AuthGroup = "auth";
        public const string Login = "login";
        public const string Callback = "callback";
        public const string Logout = "logout";
        public const string Me = "me";
    }

    public static class Tables
    {
        public const string Users = "users";
        public const string UserSessions = "user_sessions";
    }

    public static class Roles
    {
        public const string Admin = "Admin";
        public const string User = "User";

        /// <summary>The BFF's service account (<c>chess_bff</c>): the only caller allowed on the live hub.</summary>
        public const string Relay = "Relay";
    }

    public static class Policies
    {
        /// <summary>Any signed-in user (no particular role): declared on every endpoint that is not anonymous or admin.</summary>
        public const string SignedIn = "SignedIn";
    }

    public static class Claims
    {
        public const string Subject = "sub";
        public const string Email = "email";
        public const string Name = "name";
        public const string PreferredUsername = "preferred_username";
        public const string RealmAccess = "realm_access";

        /// <summary>The role list inside <see cref="RealmAccess"/>.</summary>
        public const string RealmRoles = "roles";
    }

    public static class Cache
    {
        public const string UserIdBySubject = "user-id:";
        public const string OidcDiscovery = "oidc:discovery";
        public const string PreferencesByUser = "prefs:";
    }
}
