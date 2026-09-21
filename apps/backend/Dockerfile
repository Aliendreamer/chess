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
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
ENTRYPOINT ["dotnet", "Chess.Backend.dll"]
