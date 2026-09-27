namespace Chess.Backend.WebApi.Admin;

internal sealed class ReplayDeadLettersSummary : Summary<ReplayDeadLettersEndpoint>
{
    public ReplayDeadLettersSummary()
    {
        Summary = "Replay a quarantined aggregate";
        Description = "Replays one aggregate's parked records through its projection, in seq order. 200 lifts the quarantine.";
        ExampleRequest = new ReplayDeadLettersRequest { GroupId = "chess.rm-games", AggregateId = "0199f1c2a3b47c5d8e9f0a1b2c3d4e5f" };
        Responses[200] = "All parked records applied; the quarantine is lifted.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Admins only.";
        Responses[404] = "No projection has that group id.";
        Responses[409] = "A record failed again; it and later ones stay parked.";
    }
}
