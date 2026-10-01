namespace Chess.Backend.WebApi.Me;

internal sealed class GetPreferencesSummary : Summary<GetPreferencesEndpoint>
{
    public GetPreferencesSummary()
    {
        Summary = "My display preferences";
        Description = "Board theme, piece set, piece animation, coordinates and site theme; the defaults until you choose.";
        Responses[200] = "Your preferences.";
        Responses[401] = "Not signed in.";
    }
}
