using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

internal sealed class UpdateStudySummary : Summary<UpdateStudyEndpoint>
{
    public UpdateStudySummary()
    {
        Summary = "Save a study";
        Description = "Replaces the title and the move tree of a study you own. The tree is replayed on the server; send the "
            + "version you opened, so a save over someone else's is refused instead of lost.";
        ExampleRequest = new UpdateStudyRequest { Title = "Ruy Lopez ideas", Tree = [new StudyMoveInput("e2e4")], Version = 1 };
        Responses[200] = "The saved study (with its new version).";
        Responses[400] = "An illegal move (named), too many moves, or no title.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such study of yours.";
        Responses[409] = "The study was saved elsewhere since you opened it.";
    }
}
