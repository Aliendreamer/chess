using Chess.Backend.Trainer;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The study line to drill next, or none for now with when the next is due.</summary>
internal sealed record NextStudyLineResponse(StudyLineProgress? Line, DateTimeOffset? NextDueAt);
