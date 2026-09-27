# service-operations Specification

## Purpose

How the backend runs in operation: it logs why a start failed and what each startup step did, never logging
secrets, and it takes every operational value from validated configuration.

## Requirements

### Requirement: A failed startup says why

The backend SHALL log any exception thrown while starting at Fatal level, naming the startup step that failed, and
exit with a non-zero code. The log MUST be written even when the failure happens before the host is built.

#### Scenario: A bad setting

- **WHEN** the backend starts with `RateLimit:PermitLimit` set to `0`
- **THEN** the console shows a Fatal event "Startup failed at {Step}" naming the step and the invalid setting, and the
  process exits with code 1

#### Scenario: The database is unreachable

- **WHEN** the primary database refuses connections during migration
- **THEN** the Fatal event names the migration step and carries the connection error

### Requirement: Startup steps are logged without secrets

A successful startup SHALL log each step as it begins and completes, and one summary of the settings that shape the
node's behaviour. No log event MAY contain a password, client secret or complete connection string.

#### Scenario: What a node reports

- **WHEN** a backend node starts
- **THEN** the log shows each step with its duration, a summary with the Akka address, Kafka on/off, Redis on/off and
  database hosts, and "startup complete"

#### Scenario: Secrets stay out

- **WHEN** the configuration carries a database password and the Keycloak client secret
- **THEN** neither value appears in any startup log event

### Requirement: Operational values come from validated configuration

The backend SHALL take every operational value from an options class bound to a configuration section: timeouts,
cache lifetimes, health-check limits, retry delays, page sizes, and sweep and passivation intervals. Each option
MUST default to the current value, MUST be listed in `appsettings.json`, and MUST be validated at startup. Game rules
decided in the ROADMAP (first-move abort, invite lifetime, queue entry lifetime, passivation after the end) SHALL stay
in code.

#### Scenario: Tuning without a build

- **WHEN** an operator sets `Api:AskTimeoutSeconds` to `8`
- **THEN** every actor ask from an endpoint or live source waits up to 8 seconds, with no code change

#### Scenario: The file and the code agree

- **WHEN** the unit tests run
- **THEN** binding the real `appsettings.json` gives the same values as each options class's defaults
