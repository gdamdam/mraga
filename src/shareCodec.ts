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
    new Response(bytes as unknown as BodyInit).body!.pipeThrough(cs),
  ).arrayBuffer();
  return new Uint8Array(blob);
}

// Cap the decompressed size: read the stream chunk-by-chunk and abort once the
// running total exceeds the limit, so a tiny "deflate bomb" payload can never
// force a huge allocation. A real mdrone scene inflates to well under this.
const MAX_INFLATED_BYTES = 256 * 1024;

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > MAX_INFLATED_BYTES) {
        await reader.cancel();
        throw new Error("mraga: decompressed share payload too large");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
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

// Bound the raw payload too — a legit mdrone link is a few hundred base64 chars.
const MAX_PAYLOAD_CHARS = 32 * 1024;

export async function decodePayload(payload: string, compressed: boolean): Promise<unknown> {
  if (typeof payload !== "string" || payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error("mraga: share payload too large");
  }
  let bytes = urlSafeB64ToBytes(payload);
  if (compressed) {
    try {
      bytes = await inflate(bytes);
    } catch (e) {
      // Preserve the size-guard rejection; wrap only genuine corruption.
      if (e instanceof Error && /too large/.test(e.message)) throw e;
      throw new Error("mraga: failed to decompress share payload");
    }
  }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("mraga: share payload is not valid JSON"); }
}
