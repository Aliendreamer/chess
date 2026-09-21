using Microsoft.EntityFrameworkCore.Design;

namespace Chess.Backend.Data;

/// <summary>Design-time factory for <c>dotnet ef</c>; the connection string is never opened for migrations.</summary>
internal sealed class ProjectDbContextFactory : IDesignTimeDbContextFactory<ProjectDbContext>
{
    public ProjectDbContext CreateDbContext(string[] args)
    {
        string connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            ?? "Host=localhost;Port=5432;Database=chess;Username=chess;Password=chess";
        DbContextOptionsBuilder<ProjectDbContext> builder = new();
        builder.UseNpgsql(connectionString);
        return new ProjectDbContext(builder.Options);
    }
}
