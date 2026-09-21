#!/usr/bin/env bash
# Add an EF Core migration: ./build_migration.sh "AddSomething"   (needs the dotnet-ef 10.x global tool)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
NAME="${1:?usage: $0 <MigrationName>}"
dotnet ef migrations add "$NAME" --project Chess.Backend.csproj --output-dir Data/Migrations
