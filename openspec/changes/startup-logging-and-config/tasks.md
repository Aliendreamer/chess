Each group ends in one commit that passes the backend gate (build with no warnings, unit tests, `dotnet format
--verify-no-changes`). 🐳 marks steps that need Docker.

## 1. Startup logging

- [x] 1.1 Failing tests: `StartupSummary.Describe` hides passwords, secrets and full connection strings (fixed config with
      known secrets); it shows the Akka address, Kafka on/off and database hosts.
- [x] 1.2 Bootstrap logger and `StartupSteps` in `Program.cs` (D1, D2); the summary event.
- [x] 1.3 🐳 The integration suite passes (several in-process hosts); a started stack shows the step lines; a stack
      started with `RateLimit__PermitLimit=0` shows the Fatal line and exits 1. Commit:
      `feat(backend): startup logging with steps, summary and fatal reason`.

## 2. Configuration

- [ ] 2.1 Failing tests: every options class validates (positive values); binding the real `appsettings.json` equals the
      class defaults.
- [ ] 2.2 Move each value in the proposal's table into its options class and read it from there; remove
      `Keyset.MaxLimit`; bind all options one way (D4); add the sections to `appsettings.json`.
- [ ] 2.3 🐳 Unit and integration suites; live stack restart and `verify-part1.sh`. Commit:
      `feat(backend): every operational value from validated configuration`.

## 3. Docs

- [ ] 3.1 CLAUDE.md (startup logging, the configuration rule and where the settings live). Commit:
      `docs(repo): startup logging and configuration`.
