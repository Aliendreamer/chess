namespace Chess.Backend.Utils;

/// <summary>One page of a keyset-paged list. <see cref="NextCursor"/> is null on the last page.</summary>
internal sealed record CursorPage<T>(IReadOnlyList<T> Items, string? NextCursor, int Limit);
