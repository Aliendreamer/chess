using FluentValidation;

namespace Chess.Backend.WebApi.Studies;

internal sealed class ShareStudyRequest : IStudyRoute
{
    public string Id { get; init; } = string.Empty;

    /// <summary>True lets anyone signed in open the study by its link, read-only.</summary>
    public bool Shared { get; init; }
}

internal sealed class ShareStudyRequestValidator : Validator<ShareStudyRequest>
{
    public ShareStudyRequestValidator() => RuleFor(r => r.Id).MustBeStudyId();
}
