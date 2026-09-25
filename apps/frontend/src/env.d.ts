/// <reference types="vite/client" />

// Deliberately no VITE_API_URL: the only API configuration is the server-side API_URL,
// read in lib/server/*. Nothing about the API reaches the client bundle.
declare namespace NodeJS {
  interface ProcessEnv {
    API_URL?: string
    COOKIE_SECURE?: string
    KEYCLOAK_TOKEN_URL?: string
    RELAY_CLIENT_ID?: string
    RELAY_CLIENT_SECRET?: string
    RELAY_REVALIDATE_MS?: string
  }
}
