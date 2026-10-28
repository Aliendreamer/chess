# apps/engine — Chess.Engine

Loaded when working under `apps/engine`. How the backend talks to the worker (topics, think times, stalls) is in the
"Games against the computer" and "Engine analysis" sections of `apps/backend/CLAUDE.md`.

```bash
# engine (apps/engine)
dotnet build Chess.Engine.csproj && dotnet test Chess.Engine.Tests   # UCI client + worker against a fake engine
```
