import { HttpTransportType, HubConnectionBuilder } from '@microsoft/signalr'
import { isLiveFrame } from '../live'
import { apiUrl, keycloakTokenUrl, relayClient } from './config'
import { createHubMultiplexer } from './hub-multiplexer'
import { createServiceToken } from './service-token'
import type { HubMultiplexer, HubPort } from './hub-multiplexer'

/**
 * The real `HubPort`: one SignalR connection to the backend's `/hub/live`, authenticated as the `chess_bff` service
 * account. In Node the client sends the token as an `Authorization: Bearer` header (browsers would use the query
 * string), which JwtBearer takes over any cookie.
 */
export function signalRPort(url: string, accessToken: () => Promise<string>): HubPort {
  const hub = new HubConnectionBuilder()
    .withUrl(url, { accessTokenFactory: accessToken, transport: HttpTransportType.WebSockets })
    .withAutomaticReconnect()
    .build()
  return {
    start: () => hub.start(),
    invoke: (method, ...args) => hub.invoke(method, ...args),
    onFrame: (handler) =>
      hub.on('frame', (frame: unknown) => {
        if (isLiveFrame(frame)) handler(frame)
      }),
    onReconnected: (handler) => hub.onreconnected(() => handler()),
    onClose: (handler) => hub.onclose(() => handler()),
    stop: () => hub.stop(),
  }
}

let shared: HubMultiplexer | null = null

/** The process-wide multiplexer. Config is read on first use, so a missing env var fails the first socket loudly. */
export function liveMultiplexer(): HubMultiplexer {
  if (!shared) {
    const client = relayClient()
    const token = createServiceToken({
      fetch: (...args) => fetch(...args),
      now: () => Date.now(),
      tokenUrl: keycloakTokenUrl(),
      clientId: client.id,
      clientSecret: client.secret,
    })
    const url = `${apiUrl()}/hub/live`
    shared = createHubMultiplexer(() => signalRPort(url, token))
  }
  return shared
}
