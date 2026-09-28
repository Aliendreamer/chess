using Chess.Backend.WebApi.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Studies;

internal static class StudyRules
{
    public static IRuleBuilderOptions<T, string> MustBeStudyId<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(id => GameReplyMapper.TryParseId(id, out _)).WithMessage("Study id must be a lower-case Guid, with or without dashes.");
}
