#!/usr/bin/env bash
# Add an EF Core migration: ./build_migration.sh "AddSomething"   (needs the dotnet-ef 10.x global tool)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
NAME="${1:?usage: $0 <MigrationName>}"
# --context is required since the replica-bound ReadDbContext exists: migrations belong to the write
# context only, and EF refuses to guess between the two.
dotnet ef migrations add "$NAME" --project Chess.Backend.csproj --context ProjectDbContext --output-dir Data/Migrations
# dotnet-ef writes a UTF-8 BOM; the repo's .editorconfig is plain utf-8.
sed -i '1s/^\xEF\xBB\xBF//' Data/Migrations/*.cs
