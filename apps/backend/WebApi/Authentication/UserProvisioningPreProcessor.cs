namespace Chess.Backend.WebApi.Authentication;

/// <summary>
/// Global pre-processor: for authenticated requests, JIT-provisions the local user row by <c>sub</c> and fills
/// the scoped <see cref="ICurrentUser"/>. Anonymous requests pass through untouched.
/// </summary>
internal sealed class UserProvisioningPreProcessor : IGlobalPreProcessor
{
    public async Task PreProcessAsync(IPreProcessorContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        HttpContext http = context.HttpContext;
        ClaimsPrincipal principal = http.User;
        if (principal.Identity?.IsAuthenticated != true)
        {
            return;
        }

        string? subject = principal.FindFirstValue(Constants.Claims.Subject)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(subject))
        {
            return;
        }

        string? email = principal.FindFirstValue(Constants.Claims.Email) ?? principal.FindFirstValue(ClaimTypes.Email);
        string? fullName = principal.FindFirstValue(Constants.Claims.Name)
            ?? principal.FindFirstValue(Constants.Claims.PreferredUsername);
        List<string> roles = principal.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct(StringComparer.Ordinal).ToList();

        IUserProvisioningService provisioning = http.RequestServices.GetRequiredService<IUserProvisioningService>();
        string? username = principal.FindFirstValue(Constants.Claims.PreferredUsername);
        long id = await provisioning.EnsureUserAsync(subject, email, fullName, username, ct);

        if (http.RequestServices.GetRequiredService<ICurrentUser>() is CurrentUser current)
        {
            current.Populate(id, subject, email, fullName, roles);
        }
    }
}
