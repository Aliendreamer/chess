namespace Chess.Backend.Services;

internal abstract class BaseService(ProjectDbContext context, ILogger logger)
{
    protected ProjectDbContext Context { get; } = context;

    protected ILogger Logger { get; } = logger;
}
