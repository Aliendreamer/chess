using Chess.Backend.WebApi.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Studies;

/// <summary>The request of every study endpoint that takes only the route.</summary>
internal sealed class StudyRouteRequest : IStudyRoute
{
    /// <summary>The study id: a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;
}

internal sealed class StudyRouteRequestValidator : Validator<StudyRouteRequest>
{
    public StudyRouteRequestValidator() => RuleFor(r => r.Id).MustBeStudyId();
}
