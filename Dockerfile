# Multi-stage build for TankWar Haskell Dedicated Server
FROM haskell:9.4 AS builder

WORKDIR /build

COPY package.yaml stack.yaml tankwar.cabal ./
RUN cabal update

COPY src/ ./src/
COPY server/ ./server/
COPY test/ ./test/

# Install binary directly to /build/tankwar-server
RUN cabal install exe:tankwar-server \
    --installdir=/build \
    --install-method=copy \
    --overwrite-policy=always

# Minimal runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgmp10 \
    netbase \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

WORKDIR /app
COPY --from=builder /build/tankwar-server /app/tankwar-server

EXPOSE 8080

ENTRYPOINT ["/app/tankwar-server"]
CMD ["--port", "8080", "--mongo-uri", "mongodb://mongo:27017/TankWar"]