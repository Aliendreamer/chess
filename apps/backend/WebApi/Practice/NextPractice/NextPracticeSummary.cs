namespace Chess.Backend.WebApi.Practice;

internal sealed class NextPracticeSummary : Summary<NextPracticeEndpoint>
{
    public NextPracticeSummary()
    {
        Summary = "The next practice position";
        Description = "The caller's due mistake with the lowest box, then the oldest due: the position, the move played, the moves the engine accepts, its best line, and the game it came from. When nothing is due, the item is null and nextDueAt says when (null too: nothing to practise).";
        Responses[200] = "The position, or when the next is due.";
        Responses[401] = "Not signed in.";
    }
}
