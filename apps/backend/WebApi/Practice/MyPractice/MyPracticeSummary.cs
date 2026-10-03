namespace Chess.Backend.WebApi.Practice;

internal sealed class MyPracticeSummary : Summary<MyPracticeEndpoint>
{
    public MyPracticeSummary()
    {
        Summary = "My practice";
        Description = "How many of the caller's mistakes are in their practice, how many are learned (box 3 and up), and how many are due now.";
        Responses[200] = "The counts.";
        Responses[401] = "Not signed in.";
    }
}
