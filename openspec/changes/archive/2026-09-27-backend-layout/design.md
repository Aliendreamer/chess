## Context

The layout grew one change at a time. The house template (`.claude/commands/dotnet-webapi.md`) set the endpoint
pattern (`WebApi/Auth/Login/LoginEndpoint.cs`), and later endpoints didn't follow it. The owner wants the pattern
kept and extended: one folder per endpoint with its request, response and summary. Non-endpoint code comes out of
`WebApi/`, and the rest is grouped by concern.

## Goals / Non-Goals

**Goals:** the target tree in the proposal, no behaviour change, and every test still passing.

**Non-Goals:** the frontend, routes, JSON shapes, `Services/`.

## Decisions

### D1. Stored type names fix two namespaces

The Akka journal stores each event as JSON with `"$type":"Chess.Backend.Events.X, Chess.Backend"`, and the EF
model snapshot names entities as `Chess.Backend.Data.Models.X`. Both namespaces stay as they are, whatever folder
rule applies elsewhere. Checked in the stack's journal: every stored payload names `Chess.Backend.Events.*`.

### D2. Summaries are FastEndpoints `Summary<TEndpoint>` classes

The `Description(d => d.WithSummary(…))` text in each `Configure()` moves to `{Name}Summary.cs`, including response
examples where they exist. `Description(...)` keeps only tags and `Produces` codes, so the OpenAPI output stays the
same.

### D3. The move is scripted, and the compiler checks it

A script moves and merges files, rewrites namespaces, and maps every `using` of an old namespace to the new ones its
types went to. Endpoint splitting is done by hand, one area at a time. `dotnet build` with
`TreatWarningsAsErrors`, the full unit and integration suites, and `dotnet format` are the proof.

## Risks / Trade-offs

- [Namespace churn in tests] The test folders move with the code. → That's a mechanical change, and the compiler
  finds every miss.
- [The live stack's `dotnet watch` after a large move] → Restart both backend nodes, then run `verify-part1.sh` and
  the e2e suite.
