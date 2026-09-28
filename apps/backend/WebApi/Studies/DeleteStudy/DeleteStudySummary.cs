namespace Chess.Backend.WebApi.Studies;

internal sealed class DeleteStudySummary : Summary<DeleteStudyEndpoint>
{
    public DeleteStudySummary()
    {
        Summary = "Delete a study";
        Description = "Deletes a study you own; its link stops working.";
        Responses[204] = "Deleted.";
        Responses[400] = "Not a study id.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such study of yours.";
    }
}
