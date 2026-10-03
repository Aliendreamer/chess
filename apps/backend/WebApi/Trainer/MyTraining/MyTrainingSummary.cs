namespace Chess.Backend.WebApi.Trainer;

internal sealed class MyTrainingSummary : Summary<MyTrainingEndpoint>
{
    public MyTrainingSummary()
    {
        Summary = "My trained openings";
        Description = "The families the signed-in member has trained, per side, with lines and learned lines. Only ever the member's own.";
        Responses[200] = "The trained families.";
        Responses[401] = "Not signed in.";
    }
}
