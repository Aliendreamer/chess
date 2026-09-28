namespace Chess.Backend.WebApi.Studies;

internal sealed class MyStudiesSummary : Summary<MyStudiesEndpoint>
{
    public MyStudiesSummary()
    {
        Summary = "My studies";
        Description = "The studies you own, newest first.";
        ExampleRequest = new MyStudiesRequest { Limit = 20 };
        Responses[200] = "A page, newest first; follow nextCursor for more.";
        Responses[400] = "Invalid limit or cursor.";
        Responses[401] = "Not signed in.";
    }
}
