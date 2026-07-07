/**
 * mbus-client — tab-to-tab WebRTC audio for the m-suite.
 * AGPL-3.0-or-later. See mbus/docs/protocol.md for the wire protocol.
 *
 * Vendored verbatim from the sibling mbus project (mbus/packages/mbus-client,
 * AGPL-3.0-or-later, github.com/gdamdam/mbus) — client.ts and protocol.ts.
 * The suite has no shared package registry yet, so the library is copied here
 * and credited rather than imported, matching how src/engine/linkBridge.ts
 * reuses mpump's Link client. Kept byte-for-byte with upstream so it stays
 * trivially re-syncable (mbus/scripts/sync-vendored.mjs); do not edit —
 * change it upstream and re-copy.
 */

export { createMbusClient } from './client.js'
export type {
  BridgeState,
  MbusClient,
  MbusClientOptions,
  PeerConnectionLike,
  Publication,
  PublicationState,
  Subscription,
  SubscriptionState,
  WebSocketLike,
} from './client.js'
export {
  DEFAULT_WS_URLS,
  MBUS_VERSION,
  outbound,
  parseServerMessage,
  parseSignalPayload,
} from './protocol.js'
export type { ServerMessage, SignalPayload, SourceInfo } from './protocol.js'
