namespace Chess.Backend.WebApi.Me;

internal sealed class PutPreferencesSummary : Summary<PutPreferencesEndpoint>
{
    public PutPreferencesSummary()
    {
        Summary = "Save my display preferences";
        Description = "Replaces all of your display preferences at once. Every value must be one the site offers.";
        ExampleRequest = new PutPreferencesRequest { BoardTheme = "blue", PieceSet = "cburnett", Animation = "fast", Coordinates = true, SiteTheme = "dark" };
        Responses[200] = "The saved preferences.";
        Responses[400] = "A value the site does not offer (the field is named).";
        Responses[401] = "Not signed in.";
    }
}
