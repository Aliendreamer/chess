# Coverage build of Chess.Backend for the instrumented E2E run: publish the app, then run it
# under `dotnet-coverage`, which collects line coverage of the live process driven by Playwright and
# writes a Cobertura report to /cov on shutdown (SIGTERM from `docker stop`). Runtime is the SDK image
# because `dotnet-coverage` is an SDK tool. Build context = apps/backend.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Chess.Backend.csproj Directory.Build.props Directory.Packages.props ./
# NuGet downloads reset/time out on flaky networks; --disable-parallel lowers connection pressure and a
# retry loop rides out transient failures (matches backend.dev.Dockerfile).
RUN for i in 1 2 3 4 5; do \
      echo "dotnet restore (attempt $i)…"; \
      dotnet restore Chess.Backend.csproj --disable-parallel && break; \
      [ "$i" = "5" ] && { echo "dotnet restore failed after 5 attempts" >&2; exit 1; }; \
      sleep 10; \
    done
COPY . .
# Full debug symbols so dotnet-coverage maps IL back to source lines.
RUN dotnet publish Chess.Backend.csproj -c Release -o /app /p:UseAppHost=false /p:DebugType=portable

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
ENV PATH="${PATH}:/root/.dotnet/tools"
# dotnet-coverage's instrumentation-engine profiler (libInstrumentationEngine.so) needs libxml2 at runtime;
# without it the profiler silently fails to initialize and collects zero data ("Profiler was not
# initialized. Verify that glibc (>=2.27), libxml2 ... are installed").
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxml2 \
    && rm -rf /var/lib/apt/lists/*
# 18.x adds .NET 10 profiler support; 17.14.2 predates .NET 10 GA.
RUN dotnet tool install --global dotnet-coverage --version 18.8.0
EXPOSE 8080
COPY --from=build /app ./
# dotnet-coverage wraps the app under a NAMED SESSION. Signals to the collector are unreliable for a
# long-running server in a container (per the docs), so the runner finalizes by running
# `dotnet-coverage shutdown ccbackend` INSIDE the container — that stops collection, writes the Cobertura
# report to the mounted /cov, and exits the server.
ENTRYPOINT ["dotnet-coverage", "collect", \
  "--session-id", "ccbackend", \
  "--settings", "/coverage.runsettings", \
  "--output", "/cov/backend.cobertura.xml", "--output-format", "cobertura", \
  "--", "dotnet", "Chess.Backend.dll"]
