# syntax=docker/dockerfile:1
# The engine worker (engine-play D1), for production AND the local stack: it has no hot reload to gain from a dev
# image. Build context = apps/engine. Stockfish (GPLv3) is the official release, downloaded at build time and checked
# against a pinned SHA-256 (stockfish-pinned-download): a mismatch fails the build. Bump both ARGs together.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG STOCKFISH_TAG=sf_19
ARG STOCKFISH_URL=https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz
ARG STOCKFISH_SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f

# First, so the download stays cached across code changes. The official binary is linked against glibc, hence a
# Debian-based runtime below (not Alpine like the backend). The GPL notice and where the source is travel with it.
ADD --checksum=sha256:${STOCKFISH_SHA256} ${STOCKFISH_URL} /tmp/stockfish.tar.gz
RUN mkdir -p /opt/stockfish \
  && tar -xzf /tmp/stockfish.tar.gz -C /tmp \
  && mv /tmp/stockfish/stockfish-linux-x86-64-universal /opt/stockfish/stockfish \
  && mv /tmp/stockfish/Copying.txt /opt/stockfish/Copying.txt \
  && chmod 0755 /opt/stockfish/stockfish \
  && rm -rf /tmp/stockfish /tmp/stockfish.tar.gz \
  && printf '%s\n' \
    "Stockfish ${STOCKFISH_TAG}, the unmodified official release, licensed under the GNU GPL v3 (Copying.txt)." \
    "Binary: ${STOCKFISH_URL}" \
    "SHA-256: ${STOCKFISH_SHA256}" \
    "Corresponding source: https://github.com/official-stockfish/Stockfish/tree/${STOCKFISH_TAG}" \
    "Source archive: https://github.com/official-stockfish/Stockfish/archive/refs/tags/${STOCKFISH_TAG}.tar.gz" \
    > /opt/stockfish/SOURCE.txt

WORKDIR /src

# Manifests first so the restore layer caches independently of source changes.
COPY Directory.Build.props Directory.Packages.props Chess.Engine.csproj ./
RUN for i in 1 2 3; do \
  dotnet restore Chess.Engine.csproj --disable-parallel && break; \
  [ "$i" = "3" ] && exit 1; sleep 10; \
  done

COPY *.cs appsettings.json ./
RUN dotnet publish Chess.Engine.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
ENV TZ=UTC \
  DOTNET_NOLOGO=1 \
  Engine__StockfishPath=/opt/stockfish/stockfish
# The GPL notice and the source offer travel with the binary.
COPY --from=build /opt/stockfish /opt/stockfish
WORKDIR /app
COPY --from=build /app .
USER app
ENTRYPOINT ["dotnet", "Chess.Engine.dll"]
