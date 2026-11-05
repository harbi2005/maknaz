import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { now } from './clock.js';
import { hmac, safeEqual } from './crypto.js';

/**
 * Local private file storage (ARCHITECTURE §7: "S3-compatible or local disk for the demo").
 * Files are never served statically; downloads go through short-lived signed tokens (SR-06).
 */
function root() {
  return path.resolve(config().MEDIA_ROOT);
}

function resolveKey(key: string) {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error('invalid object key');
  return full;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: 'wx' });
}

export function readObject(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

/** SR-10: detect the real type from the file content, not the extension or client header. */
export function sniffMime(buf: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  return null;
}

export function signDownload(documentId: string): { token: string; expiresIn: number } {
  const ttl = config().SIGNED_URL_TTL_SECONDS;
  const exp = Math.floor(now().getTime() / 1000) + ttl;
  const payload = `${documentId}.${exp}`;
  return { token: `${payload}.${hmac(config().APP_SECRET_KEY, payload)}`, expiresIn: ttl };
}

export type VerifyResult = { ok: true; documentId: string } | { ok: false; reason: 'invalid' | 'expired' };

export function verifyDownload(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const [id, exp, sig] = parts as [string, string, string];
  if (!safeEqual(sig, hmac(config().APP_SECRET_KEY, `${id}.${exp}`))) return { ok: false, reason: 'invalid' };
  if (Number(exp) * 1000 < now().getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, documentId: id };
}
