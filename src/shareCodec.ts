// src/shareCodec.ts
// Decodes mdrone share links. Mirrors ../mdrone/src/shareCodec.ts:
//   ?z=  deflate (native CompressionStream) + url-safe base64
//   ?b=  plain url-safe base64
// url-safe alphabet: + -> -, / -> _, padding '=' stripped.

export function bytesToUrlSafeB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function urlSafeB64ToBytes(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const blob = await new Response(
    new Response(bytes).body!.pipeThrough(cs),
  ).arrayBuffer();
  return new Uint8Array(blob);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const blob = await new Response(
    new Response(bytes).body!.pipeThrough(ds),
  ).arrayBuffer();
  return new Uint8Array(blob);
}

export async function encodeScene(
  scene: unknown,
  opts: { compress: boolean } = { compress: true },
): Promise<{ key: "z" | "b"; value: string }> {
  const json = new TextEncoder().encode(JSON.stringify(scene));
  if (opts.compress && typeof CompressionStream !== "undefined") {
    return { key: "z", value: bytesToUrlSafeB64(await deflate(json)) };
  }
  return { key: "b", value: bytesToUrlSafeB64(json) };
}

export function extractPayloadFromUrl(
  url: string,
): { payload: string; compressed: boolean } | null {
  const u = new URL(url);
  const z = u.searchParams.get("z");
  if (z) return { payload: z, compressed: true };
  const b = u.searchParams.get("b");
  if (b) return { payload: b, compressed: false };
  return null;
}

export async function decodePayload(
  payload: string,
  compressed: boolean,
): Promise<unknown> {
  let bytes = urlSafeB64ToBytes(payload);
  if (compressed) bytes = await inflate(bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}
