namespace Chess.Backend.Services;

internal abstract class BaseService(ProjectDbContext context, ILogger logger)
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 500;

    protected ProjectDbContext Context { get; } = context;

    protected ILogger Logger { get; } = logger;

    protected static (int Skip, int Take) Page(int page, int pageSize)
    {
        int size = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaxPageSize);
        int number = Math.Max(page, 1);
        return ((number - 1) * size, size);
    }
}
