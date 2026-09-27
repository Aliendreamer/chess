using Chess.Backend.Extensions;

namespace Chess.Backend.Correspondence;

/// <summary>Section <c>Correspondence</c> (correspondence-games D1, D3).</summary>
internal sealed class CorrespondenceOptions : ISettings
{
    public const string SectionName = "Correspondence";

    /// <summary>How long the player to move has, from the previous move; reset after every move.</summary>
    public TimeSpan MoveDeadline { get; set; } = TimeSpan.FromDays(7);

    /// <summary>How often the deadline sweeper looks for games past their deadline.</summary>
    public int SweepSeconds { get; set; } = 60;

    public void Validate()
    {
        if (MoveDeadline <= TimeSpan.Zero)
        {
            throw new InvalidOperationException("Correspondence:MoveDeadline must be positive.");
        }

        if (SweepSeconds <= 0)
        {
            throw new InvalidOperationException("Correspondence:SweepSeconds must be positive.");
        }
    }
}
