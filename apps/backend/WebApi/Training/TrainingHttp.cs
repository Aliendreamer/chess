using Chess.Backend.Training;
using FluentValidation;

namespace Chess.Backend.WebApi.Training;

/// <summary>The rules the training endpoints share (training D4).</summary>
internal static class TrainingHttp
{
    public static IRuleBuilderOptions<T, string> MustBeMode<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(TrainingModes.IsMode).WithMessage("Mode must be games or library.");
}
