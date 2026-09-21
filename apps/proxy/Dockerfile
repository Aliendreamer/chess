# syntax=docker/dockerfile:1
# Tiny nginx edge proxy — the single public entrypoint.
# Transparent mediator: `/api/` -> backend, everything else -> SSR frontend, `/hc` -> 200.
# Official unprivileged nginx: runs non-root, writable runtime dirs, listens on :8080.
FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
COPY ./files/nginx.conf /etc/nginx/nginx.conf

# Runtime dirs writable by the nginx user (and GID 0 for arbitrary-UID runtimes); the config stays
# read-only so a compromised nginx cannot rewrite its own routing.
RUN chmod -R ug+rwx /var/cache/nginx /var/log/nginx \
    && chmod -R ug+rX /etc/nginx
USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
