using Chess.Backend.Library;

namespace Chess.Backend.WebApi.Admin;

/// <summary>Every game of the batch, by its place in it: imported, duplicate or refused (with why).</summary>
internal sealed record ImportLibraryResponse(int Imported, int Duplicates, int Refused, IReadOnlyList<ImportItem> Items);
