#!/usr/bin/env node
// Usage: node scripts/hash-code.mjs "<code>"   ->  prints JIMKIT_UNLOCK_HASH='scrypt$...'
// Must stay in sync with apps/web/src/core/unlock.ts (a test checks that).
// The value contains $ characters: keep the single quotes in an .env file so Docker Compose doesn't try to expand them.
import { randomBytes, scryptSync } from "node:crypto";

const code = process.argv[2];
if (!code) {
  console.error('usage: node scripts/hash-code.mjs "<code>"');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(code, salt, 32, { N: 16384, r: 8, p: 1 });
console.log(`JIMKIT_UNLOCK_HASH='scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}'`);
