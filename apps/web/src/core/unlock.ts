import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "jk_unlock";
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 32;

const b64 = (b: Buffer) => b.toString("base64url");

/** Format: scrypt$<salt>$<hash>, both base64url. */
export function hashCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, KEYLEN, SCRYPT);
  return `scrypt$${b64(salt)}$${b64(hash)}`;
}

export function verifyCode(code: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (!expected.length) return false; // "scrypt$salt$=" decodes to nothing, and two empty buffers compare equal
  const actual = scryptSync(code, Buffer.from(saltB64, "base64url"), expected.length, SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface TokenPayload {
  v: 1;
  exp: number; // ms epoch
  iat: number;
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined, secret: string, now = Date.now()): TokenPayload | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (payload.v !== 1 || typeof payload.exp !== "number" || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
