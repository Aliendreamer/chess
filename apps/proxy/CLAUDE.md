# apps/proxy — nginx edge

- **Proxy** — `apps/proxy/files/nginx.conf` on `nginxinc/nginx-unprivileged` (port 8080, pid in
  `/tmp`). Upstreams are Docker service names `chess-backend:8080` / `chess-frontend:3000`, set as
  variables with `resolver 127.0.0.11` so resolution is per request and `nginx -t` passes outside
  the network. `/hc` returns 200 locally. No CSP here — the SSR layer owns it.
