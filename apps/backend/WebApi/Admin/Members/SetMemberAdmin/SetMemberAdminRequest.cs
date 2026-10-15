using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class SetMemberAdminRequest
{
    /// <summary>The member, from the route.</summary>
    public long Id { get; init; }

    /// <summary>Whether the member holds the realm role Admin.</summary>
    public bool Admin { get; init; }
}

internal sealed class SetMemberAdminRequestValidator : Validator<SetMemberAdminRequest>
{
    public SetMemberAdminRequestValidator() => RuleFor(r => r.Id).GreaterThan(0).WithMessage("Member id must be positive.");
}
