using Chess.Backend.Akka.Games;
using FluentValidation;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

internal sealed record GameReplyOutcome(bool IsSuccess, int StatusCode, GameView? View, string? Error);
