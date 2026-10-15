import { open, stat } from "node:fs/promises";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflate = promisify(inflateRaw);

/**
 * LibreOffice opens a document the way a person would, which includes calculating its formulas, and Calc's WEBSERVICE() reads a URL
 * (a web address, or a file path on the server) and puts what it finds in a cell. A spreadsheet that holds one could therefore turn
 * a conversion into a read of the server's own files or of the machines behind it, with the answer in the download. A converter has
 * no use for that, so spreadsheets that call it are refused before LibreOffice sees them.
 *
 * Spreadsheets are zip files of XML (xlsx, ods) or an old binary format (xls); both are looked through for the function's name.
 */
const SPREADSHEETS = new Set(["xlsx", "xlsm", "xltx", "xltm", "xls", "xlt", "ods", "ots", "fods"]);
const NEEDLE = /webservice/i;
const MAX_ENTRY = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_BINARY = 128 * 1024 * 1024;

export class Unsafe extends Error {}

export const isSpreadsheet = (ext: string) => SPREADSHEETS.has(ext);

/** Throws Unsafe (with a message for the visitor) when the spreadsheet calls WEBSERVICE or is too big to check. */
export async function refuseWebAccess(file: string, ext: string): Promise<void> {
  if (!isSpreadsheet(ext)) return;
  const size = (await stat(file)).size;
  const fh = await open(file, "r");
  try {
    const head = Buffer.alloc(4);
    await fh.read(head, 0, 4, 0);
    if (head.readUInt32LE(0) === 0x04034b50) await scanZip(fh, size);
    else if (ext === "fods") await scanPlain(fh, size, 0);
    else if (head.readUInt32LE(0) === 0xe011cfd0 || ext === "xls" || ext === "xlt") await scanPlain(fh, size, MAX_BINARY);
    else await scanPlain(fh, size, MAX_ENTRY);
  } finally {
    await fh.close();
  }
}

const refuse = () => new Unsafe("This spreadsheet uses WEBSERVICE(), which reads web addresses and files, so it can't be converted here.");

async function scanPlain(fh: Awaited<ReturnType<typeof open>>, size: number, limit: number) {
  if (limit && size > limit) throw new Unsafe("This spreadsheet is too large to check, so it can't be converted here.");
  const chunk = 4 * 1024 * 1024;
  let tail = "";
  const buf = Buffer.alloc(chunk);
  for (let at = 0; at < size; at += chunk) {
    const { bytesRead } = await fh.read(buf, 0, chunk, at);
    // both encodings: old binary spreadsheets keep names as 8-bit or as 16-bit text
    const text = tail + buf.subarray(0, bytesRead).toString("latin1");
    const wide = buf.subarray(0, bytesRead).toString("utf16le");
    const wide2 = buf.subarray(1, bytesRead).toString("utf16le");
    if (NEEDLE.test(text) || NEEDLE.test(wide) || NEEDLE.test(wide2)) throw refuse();
    tail = text.slice(-16);
  }
}

/** The zip's central directory lists every entry: read the XML ones, inflate them within limits, and look for the name. */
async function scanZip(fh: Awaited<ReturnType<typeof open>>, size: number) {
  const tailLen = Math.min(size, 65_557);
  const tail = Buffer.alloc(tailLen);
  await fh.read(tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Unsafe("This isn't a spreadsheet LibreOffice can read.");
  const count = tail.readUInt16LE(eocd + 10), dirSize = tail.readUInt32LE(eocd + 12), dirAt = tail.readUInt32LE(eocd + 16);
  if (dirAt === 0xffffffff || dirSize === 0xffffffff || count === 0xffff) throw new Unsafe("This spreadsheet is too large to check, so it can't be converted here.");
  if (dirSize > MAX_ENTRY) throw new Unsafe("This spreadsheet is too large to check, so it can't be converted here.");
  const dir = Buffer.alloc(dirSize);
  await fh.read(dir, 0, dirSize, dirAt);
  let at = 0, total = 0;
  for (let n = 0; n < count && at + 46 <= dir.length; n++) {
    if (dir.readUInt32LE(at) !== 0x02014b50) break;
    const method = dir.readUInt16LE(at + 10), csize = dir.readUInt32LE(at + 20), usize = dir.readUInt32LE(at + 24);
    const nameLen = dir.readUInt16LE(at + 28), extraLen = dir.readUInt16LE(at + 30), commentLen = dir.readUInt16LE(at + 32);
    const local = dir.readUInt32LE(at + 42);
    const name = dir.toString("utf8", at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    // formulas and links live in XML (and the .rels files that point at outside documents); pictures and fonts are not looked at
    if (!/\.(xml|rels|bin)$/i.test(name) && !/^(content|styles|settings)\.xml$/.test(name)) continue;
    if (csize === 0xffffffff || usize === 0xffffffff || usize > MAX_ENTRY) throw new Unsafe("This spreadsheet is too large to check, so it can't be converted here.");
    total += usize;
    if (total > MAX_TOTAL) throw new Unsafe("This spreadsheet is too large to check, so it can't be converted here.");
    const header = Buffer.alloc(30);
    await fh.read(header, 0, 30, local);
    if (header.readUInt32LE(0) !== 0x04034b50) continue;
    const dataAt = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const raw = Buffer.alloc(csize);
    await fh.read(raw, 0, csize, dataAt);
    const data = method === 0 ? raw : method === 8 ? await inflate(raw, { maxOutputLength: MAX_ENTRY }).catch(() => { throw new Unsafe("This spreadsheet can't be checked, so it can't be converted here."); }) : null;
    if (!data) continue;
    if (NEEDLE.test(data.toString("latin1"))) throw refuse();
  }
}
