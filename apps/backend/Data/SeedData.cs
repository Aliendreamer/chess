namespace Chess.Backend.Data;

/// <summary>Placeholder for reference data. Users are JIT-provisioned from Keycloak, so nothing seeds yet.</summary>
internal static class SeedData
{
    public static Task SeedAsync(ProjectDbContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        return Task.CompletedTask;
    }
}
