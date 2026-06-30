import crypto from 'node:crypto';

/**
 * App-layer token encryption (AES-256-GCM).
 *
 * The PDF architecture stores provider OAuth tokens encrypted at rest
 * (access_token_enc / refresh_token_enc BYTEA). We do the same in MongoDB:
 * tokens are encrypted with a key derived from TOKEN_ENC_KEY before they ever
 * touch the database, and decrypted only in-process when an API call is made.
 *
 * Encrypted format (single string, ':' separated, all base64):
 *   v1:<iv>:<authTag>:<ciphertext>
 */

const SALT = 'hypr-token-enc-v1'; // static salt is fine — secret comes from TOKEN_ENC_KEY

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  let secret = process.env.TOKEN_ENC_KEY;
  if (!secret) {
    // Dev fallback so local flows work without extra setup. NOT for production —
    // set TOKEN_ENC_KEY to a long random string in any shared/deployed env.
    secret = 'hypr-insecure-dev-token-key-change-me';
    console.warn('⚠️ TOKEN_ENC_KEY not set — using insecure dev key for token encryption.');
  }
  cachedKey = crypto.scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** Encrypt a plaintext string. Returns null for empty input. */
export function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a value produced by encrypt(). Returns null if missing/corrupt. */
export function decrypt(payload) {
  if (!payload || typeof payload !== 'string') return null;
  try {
    const [version, ivB64, tagB64, ctB64] = payload.split(':');
    if (version !== 'v1') return null;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    console.warn('Token decrypt failed:', e.message);
    return null;
  }
}

/** Random URL-safe token (used for OAuth state + webhook secrets). */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Constant-time string compare (CSRF state / webhook secret checks). */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** GitHub webhook signature verification (X-Hub-Signature-256: sha256=…). */
export function verifyGithubSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signatureHeader);
}
