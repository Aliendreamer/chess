namespace Chess.Backend.Data.Models;

/// <summary>
/// A study (studies D1): a title, a start position and a move tree kept as JSON (<see cref="Tree"/>, the server-completed
/// <c>StudyMove</c> list). Owned by <see cref="OwnerId"/>; <see cref="Shared"/> lets anyone signed in read it by its id,
/// a random Guid v4 because the link is the secret. <see cref="AuditableEntity.Version"/> is the concurrency token, so
/// two tabs saving over each other get a conflict instead of a silent loss.
/// </summary>
internal sealed class Study : AuditableEntity
{
    public Guid Id { get; set; }

    public long OwnerId { get; set; }

    public required string Title { get; set; }

    public required string StartFen { get; set; }

    public required string Tree { get; set; }

    public string? White { get; set; }

    public string? Black { get; set; }

    public string? Result { get; set; }

    public string? Date { get; set; }

    public bool Shared { get; set; }
}
