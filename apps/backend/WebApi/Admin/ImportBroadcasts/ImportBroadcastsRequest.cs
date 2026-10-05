using Chess.Backend.Library;
using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class ImportBroadcastsRequest
{
    /// <summary>The month to import, <c>YYYY-MM</c>.</summary>
    public string Month { get; init; } = string.Empty;
}

internal sealed class ImportBroadcastsRequestValidator : Validator<ImportBroadcastsRequest>
{
    public ImportBroadcastsRequestValidator() =>
        RuleFor(r => r.Month).Must(BroadcastFilter.IsMonth).WithMessage("A month as YYYY-MM.");
}
