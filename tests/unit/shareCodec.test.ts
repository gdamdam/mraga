import { describe, it, expect } from "vitest";
import {
  bytesToUrlSafeB64,
  urlSafeB64ToBytes,
  encodeScene,
  extractPayloadFromUrl,
  decodePayload,
} from "../../src/shareCodec";

describe("url-safe base64", () => {
  it("round-trips arbitrary bytes with no padding chars", () => {
    const bytes = new Uint8Array([0, 1, 2, 251, 252, 253, 254, 255]);
    const enc = bytesToUrlSafeB64(bytes);
    expect(enc).not.toMatch(/[+/=]/);
    expect(Array.from(urlSafeB64ToBytes(enc))).toEqual(Array.from(bytes));
  });
});

describe("scene encode/decode round-trip", () => {
  const scene = { version: 1, name: "Test", drone: { root: "D", octave: 4, tuningId: "just5" } };

  it("round-trips through the ?b= (plain) form", async () => {
    const { key, value } = await encodeScene(scene, { compress: false });
    expect(key).toBe("b");
    const url = `https://example.test/?${key}=${encodeURIComponent(value)}`;
    const extracted = extractPayloadFromUrl(url)!;
    const decoded = await decodePayload(extracted.payload, extracted.compressed);
    expect(decoded).toEqual(scene);
  });

  it("round-trips through the ?z= (deflate) form", async () => {
    const { key, value } = await encodeScene(scene, { compress: true });
    expect(key).toBe("z");
    const url = `https://example.test/?${key}=${encodeURIComponent(value)}`;
    const extracted = extractPayloadFromUrl(url)!;
    const decoded = await decodePayload(extracted.payload, extracted.compressed);
    expect(decoded).toEqual(scene);
  });

  it("extractPayloadFromUrl prefers ?z= over ?b=", () => {
    const r = extractPayloadFromUrl("https://x/?z=AAA&b=BBB")!;
    expect(r.compressed).toBe(true);
    expect(r.payload).toBe("AAA");
  });

  it("returns null when no payload param is present", () => {
    expect(extractPayloadFromUrl("https://x/?foo=bar")).toBeNull();
  });
});
