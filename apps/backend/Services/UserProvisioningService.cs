using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.Services;

internal sealed class UserProvisioningService(
    ProjectDbContext context,
    IFusionCache cache,
    ILogger<UserProvisioningService> logger) : BaseService(context, logger), IUserProvisioningService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

    public async Task<long> EnsureUserAsync(string subject, string? email, string? fullName, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);
        return await cache.GetOrSetAsync(
            Constants.Cache.UserIdBySubject + subject,
            async (FusionCacheFactoryExecutionContext<long> _, CancellationToken token) =>
                await UpsertAsync(subject, email, fullName, token),
            options => options.SetDuration(CacheTtl),
            ct);
    }

    private async Task<long> UpsertAsync(string subject, string? email, string? fullName, CancellationToken ct)
    {
        User? existing = await Context.Users.SingleOrDefaultAsync(u => u.Sub == subject, ct);
        if (existing is not null)
        {
            return existing.Id;
        }

        User user = new() { Sub = subject, Email = email, FullName = fullName };
        Context.Users.Add(user);
        try
        {
            await Context.SaveChangesAsync(ct);
            long id = user.Id;
            Log.ProvisionedUser(Logger, id, subject);
            return id;
        }
        catch (DbUpdateException)
        {
            // Lost the race with a concurrent first request for the same subject: the unique index on Sub
            // rejected our insert, so the other row is the user.
            Context.Entry(user).State = EntityState.Detached;
            User winner = await Context.Users.AsNoTracking().SingleAsync(u => u.Sub == subject, ct);
            return winner.Id;
        }
    }
}
