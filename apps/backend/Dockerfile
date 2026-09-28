# syntax=docker/dockerfile:1
# Production image for the Chess API. Build context = apps/backend.
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# Manifests first so the restore layer caches independently of source changes.
COPY Directory.Build.props Directory.Packages.props Chess.Backend.csproj ./
RUN for i in 1 2 3; do \
  dotnet restore Chess.Backend.csproj --disable-parallel && break; \
  [ "$i" = "3" ] && exit 1; sleep 10; \
  done

COPY . .
RUN dotnet publish Chess.Backend.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# Runtime: same base family and packages as tools/localdev/backend.dev.Dockerfile, so dev == prod.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
RUN apk add --no-cache tzdata icu-libs icu-data-full krb5-libs
ENV TZ=UTC \
  DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
  ASPNETCORE_HTTP_PORTS=8080 \
  ASPNETCORE_ENVIRONMENT=Production
WORKDIR /app
COPY --from=build /app .
# Continuous profiling (observability D10): the native profiler is in the image, off until a deployment sets
# CORECLR_ENABLE_PROFILING=1, LD_PRELOAD=/pyroscope/Pyroscope.Linux.ApiWrapper.x64.so and PYROSCOPE_SERVER_ADDRESS.
COPY --from=pyroscope/pyroscope-dotnet:0.14.5-musl /Pyroscope.Profiler.Native.so /Pyroscope.Linux.ApiWrapper.x64.so /pyroscope/
ENV CORECLR_ENABLE_PROFILING=0 \
  CORECLR_PROFILER={BD1A650D-AC5D-4896-B64F-D6FA25D6B26A} \
  CORECLR_PROFILER_PATH=/pyroscope/Pyroscope.Profiler.Native.so
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
ENTRYPOINT ["dotnet", "Chess.Backend.dll"]
