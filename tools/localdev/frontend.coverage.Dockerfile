# Coverage runner for the istanbul-instrumented SSR BFF. The `.output` (built on the host with
# COVERAGE=1, so it carries istanbul counters) and its output are bind-mounted at runtime by
# docker-compose.coverage*.yml. There's no collector to install — the instrumentation is baked into the
# build; the flush preload writes the accumulated `__coverage__` to /cov on stop, and `nyc report` turns
# it into a report on the host. Minimal image, no registry install → immune to flaky build networks.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Turns a stop signal into a clean exit + dumps __coverage__ to /cov/out.
COPY tools/localdev/flush-coverage.cjs /flush-coverage.cjs
# .output and /cov are provided as bind mounts (see the coverage compose files).
CMD ["node", "--require", "/flush-coverage.cjs", ".output/server/index.mjs"]
