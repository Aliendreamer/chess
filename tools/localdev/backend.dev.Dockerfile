# syntax=docker/dockerfile:1
# Local-dev image for the backend: `dotnet watch` against bind-mounted source.
# Build context = apps/backend (see docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine

WORKDIR /src

# Deliberately IDENTICAL to apps/backend/Dockerfile's runtime setup — same base family, same packages,
# same env. The only intended difference is that this one runs `dotnet watch` against bind-mounted
# source instead of a published build, so dev is equivalent to prod by construction, not by accident.
#
#   krb5-libs      libgssapi_krb5.so.2 — Npgsql probes GSSAPI at startup (password auth, not Kerberos).
#   tzdata         Timezone database for ENV TZ.
#   icu-libs +     Globalization data (INVARIANT=false below).
#   icu-data-full
RUN apk add --no-cache tzdata icu-libs icu-data-full krb5-libs

# TZ and INVARIANT mirror the runtime image. DOTNET_NOLOGO and the polling watcher are the only
# dev-specific settings — bind mounts do not raise inotify events, so the default watcher sees nothing.
ENV TZ=UTC \
  DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
  DOTNET_NOLOGO=1 \
  DOTNET_USE_POLLING_FILE_WATCHER=1 \
  ASPNETCORE_HTTP_PORTS=8080

# Manifests only (Central Package Management): warm the restore layer. Only the backend project is
# restored — the test project references it, not the reverse, and .dockerignore excludes the tests.
COPY Directory.Build.props Directory.Packages.props Chess.Backend.csproj ./
# NuGet downloads can be reset mid-flight on slow/flaky networks; --disable-parallel lowers connection
# pressure and a short retry loop rides out transient failures instead of failing the whole build.
RUN for i in 1 2 3; do \
  echo "dotnet restore (attempt $i)…"; \
  dotnet restore Chess.Backend.csproj --disable-parallel && break; \
  [ "$i" = "3" ] && { echo "dotnet restore failed after 3 attempts" >&2; exit 1; }; \
  sleep 10; \
  done

EXPOSE 8080
CMD ["dotnet", "watch", "run", "--project", "Chess.Backend.csproj", "--urls", "http://0.0.0.0:8080", "--non-interactive"]
