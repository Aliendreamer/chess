# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine

WORKDIR /src


# Deliberately IDENTICAL to apps/backend/Dockerfile's runtime setup — same base family, same packages,
# same env, same OpenSSL policy. The only intended difference between the two images is that this one runs
# `dotnet watch` against bind-mounted source instead of a published build.
#
# All four are named even though the SDK base already ships tzdata + ICU and already defaults
# INVARIANT=false. Relying on those defaults is what would make dev only ACCIDENTALLY equivalent to prod:
# the day a base image drops one, dev keeps working and prod breaks — the exact failure this parity rules
# out. apk is idempotent, so naming an already-present package costs nothing.
#
#   krb5-libs      libgssapi_krb5.so.2 — Npgsql probes GSSAPI at startup (password auth, not Kerberos),
#                  and Microsoft.Data.SqlClient loads it for OneTv. NOTE: the Debian package is
#                  libgssapi-krb5-2, which does NOT exist on Alpine.
#   tzdata         Timezone database, for ENV TZ below and the scheduler's cron timezone.
#   icu-libs +     Globalization data. Microsoft.Data.SqlClient REFUSES invariant mode and OneTv is SQL
#   icu-data-full  Server, so ICU + INVARIANT=false is required, not cosmetic.
RUN apk add --no-cache tzdata icu-libs icu-data-full krb5-libs

# The legacy OneTv MSSQL server only offers old TLS/ciphers that OpenSSL 3.x (SECLEVEL 2, TLS 1.2
# floor) rejects during the Microsoft.Data.SqlClient pre-login handshake ("SSL Provider, error: 31").
# Lower the security level + TLS floor so that handshake succeeds. Mirrors apps/backend/Dockerfile.
# Verified against Alpine's OpenSSL 3.5.8: [openssl_init] exists with no ssl_conf, so the insert lands
# inside the existing section and the config still parses.
RUN sed -i '/^\[openssl_init\]/a ssl_conf = ssl_sect' /etc/ssl/openssl.cnf \
  && printf '\n[ssl_sect]\nsystem_default = system_default_sect\n\n[system_default_sect]\nCipherString = DEFAULT@SECLEVEL=0\nMinProtocol = TLSv1\nOptions = UnsafeLegacyRenegotiation\n' >> /etc/ssl/openssl.cnf

# TZ and INVARIANT mirror the runtime image, so log timestamps and globalization behave identically here.
# DOTNET_NOLOGO and the polling watcher are the only dev-specific settings — bind mounts do not raise
# inotify events, so the default file watcher sees nothing.
ENV TZ=Europe/Sofia \
  DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
  DOTNET_NOLOGO=1 \
  DOTNET_USE_POLLING_FILE_WATCHER=1 \
  ASPNETCORE_HTTP_PORTS=8080

# Manifests only (Central Package Management): warm the restore layer. Only the backend project is
# restored — it has no reference to the test project (the test project references it, not the
# reverse), and apps/backend/.dockerignore excludes the test project from the build context anyway.
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
