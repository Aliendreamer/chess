using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class CreateMemberRequest
{
    /// <summary>The sign-in name and the name shown in the club: lower-case letters, digits, '.', '_' or '-'.</summary>
    public string Username { get; init; } = string.Empty;

    public string FullName { get; init; } = string.Empty;

    public string? Email { get; init; }
}

internal sealed partial class CreateMemberRequestValidator : Validator<CreateMemberRequest>
{
    public CreateMemberRequestValidator()
    {
        RuleFor(r => r.Username).Must(u => u is not null && UsernamePattern().IsMatch(u.Trim().ToLowerInvariant()))
            .WithMessage("Username: 3 to 32 letters, digits, '.', '_' or '-', starting with a letter or digit.");
        RuleFor(r => r.FullName).Must(n => !string.IsNullOrWhiteSpace(n) && n.Trim().Length <= 100).WithMessage("Full name: 1 to 100 characters.");
        RuleFor(r => r.Email).EmailAddress().MaximumLength(320).When(r => !string.IsNullOrWhiteSpace(r.Email)).WithMessage("Not an e-mail address.");
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[a-z0-9][a-z0-9._-]{2,31}$")]
    private static partial System.Text.RegularExpressions.Regex UsernamePattern();
}
