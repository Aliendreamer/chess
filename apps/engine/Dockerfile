# syntax=docker/dockerfile:1
# The engine worker (engine-play D1), for production AND the local stack: it has no hot reload to gain from a dev
# image. Build context = apps/engine. The Stockfish 19 archive must be in stockfish/ (git-ignored, GPLv3); downloading
# a pinned release at build time comes later.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Manifests first so the restore layer caches independently of source changes.
COPY Directory.Build.props Directory.Packages.props Chess.Engine.csproj ./
RUN for i in 1 2 3; do \
  dotnet restore Chess.Engine.csproj --disable-parallel && break; \
  [ "$i" = "3" ] && exit 1; sleep 10; \
  done

COPY *.cs appsettings.json ./
RUN dotnet publish Chess.Engine.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# The official binary is linked against glibc, hence a Debian-based runtime below (not Alpine like the backend).
COPY stockfish/stockfish-linux-x86-64-universal.tar.gz /tmp/stockfish.tar.gz
RUN mkdir -p /opt/stockfish \
  && tar -xzf /tmp/stockfish.tar.gz -C /tmp \
  && mv /tmp/stockfish/stockfish-linux-x86-64-universal /opt/stockfish/stockfish \
  && mv /tmp/stockfish/Copying.txt /opt/stockfish/Copying.txt \
  && chmod 0755 /opt/stockfish/stockfish

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
ENV TZ=UTC \
  DOTNET_NOLOGO=1 \
  Engine__StockfishPath=/opt/stockfish/stockfish
# The GPL notice travels with the binary.
COPY --from=build /opt/stockfish /opt/stockfish
WORKDIR /app
COPY --from=build /app .
USER app
ENTRYPOINT ["dotnet", "Chess.Engine.dll"]
