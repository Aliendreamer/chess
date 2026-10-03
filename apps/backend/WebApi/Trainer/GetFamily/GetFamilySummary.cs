namespace Chess.Backend.WebApi.Trainer;

internal sealed class GetFamilySummary : Summary<GetFamilyEndpoint>
{
    public GetFamilySummary()
    {
        Summary = "A family's lines";
        Description = "The lines a family or variation drills (named lines no other line extends), with their moves and the member's box and due time from the given side (null: never trained). 404 when the name is no family.";
        Responses[200] = "The lines with the member's state.";
        Responses[400] = "A malformed name or colour.";
        Responses[401] = "Not signed in.";
        Responses[404] = "No such family or variation.";
    }
}
