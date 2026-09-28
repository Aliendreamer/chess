using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

internal sealed class CreateStudiesSummary : Summary<CreateStudiesEndpoint>
{
    public CreateStudiesSummary()
    {
        Summary = "Create or import studies";
        Description = "Creates up to 20 studies owned by you, e.g. the games of an imported PGN. The server replays every line "
            + "and stores its own SAN and FEN; a study with an illegal move is refused and listed in refused, the others are created.";
        ExampleRequest = new CreateStudiesRequest
        {
            Studies = [new StudyInput("Ruy Lopez ideas", null, [new StudyMoveInput("e2e4", [new StudyMoveInput("e7e5")])])],
        };
        Responses[201] = "The studies created and the ones refused, by index.";
        Responses[400] = "No studies, or more than 20.";
        Responses[401] = "Not signed in.";
    }
}
