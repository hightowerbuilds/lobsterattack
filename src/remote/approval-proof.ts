import type { Approval } from "./types.ts";

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The one-time proof tiny-axe checks: HMAC(PBKDF2(pin, salt), id|nonce|approve|total). */
export async function proofFor(a: Approval, pin: string, total: string): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(a.salt), iterations: a.iterations },
    base,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${a.id}|${a.nonce}|approve|${total}`)));
}
