namespace Chess.Backend.Utils;

internal static class Constants
{
    public const string RoutePrefix = "api";
    public const string CorsPolicy = "AppOrigins";
    public const string KeycloakHttpClient = "keycloak";
    public const string HealthPath = "/health";

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
    }

    public static class Claims
    {
        public const string Subject = "sub";
        public const string Email = "email";
        public const string Name = "name";
        public const string PreferredUsername = "preferred_username";
        public const string RealmAccess = "realm_access";
    }

    public static class Cache
    {
        public const string UserIdBySubject = "user-id:";
        public const string OidcDiscovery = "oidc:discovery";
    }
}
