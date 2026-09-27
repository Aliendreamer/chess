namespace Chess.Backend.Data;

/// <summary>Marker for convention-registered scoped services (<c>XxxService : BaseService, IXxxService</c>).</summary>
internal interface IService;

internal abstract class BaseService(ProjectDbContext context, ILogger logger)
{
    protected ProjectDbContext Context { get; } = context;

    protected ILogger Logger { get; } = logger;
}
