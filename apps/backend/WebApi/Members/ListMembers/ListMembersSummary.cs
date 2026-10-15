namespace Chess.Backend.WebApi.Members;

internal sealed class ListMembersSummary : Summary<ListMembersEndpoint>
{
    public ListMembersSummary()
    {
        Summary = "List the club's members";
        Description = "Every active member with their state (online, playing or offline) and when they were last seen; online and playing first, then by name. The same object (with seq) is live on members:all.";
        Responses[200] = "The members; presenceKnown is false, and everyone offline, when presence did not answer in time.";
        Responses[401] = "Not signed in.";
    }
}
