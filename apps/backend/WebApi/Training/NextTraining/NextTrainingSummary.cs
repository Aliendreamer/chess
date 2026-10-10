namespace Chess.Backend.WebApi.Training;

internal sealed class NextTrainingSummary : Summary<NextTrainingEndpoint>
{
    public NextTrainingSummary()
    {
        Summary = "The next training position";
        Description = "games: the caller's own mistakes (their finished reviews are copied in first) — due first (oldest due), then the rest by box, oldest answered first. library: critical moments of master games matching the filters (eco prefix or opening name, phase, player, from/to year) — due first, then new ones in random order. Never one of the excluded ids (at most 100). item is null when nothing is left; pool is how many positions match.";
        Responses[200] = "The position, or none, with the pool size.";
        Responses[400] = "A malformed mode, filter or excluded id.";
        Responses[401] = "Not signed in.";
    }
}
