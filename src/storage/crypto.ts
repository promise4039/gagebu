function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

export function b64OfBytes(bytes: Uint8Array): string {
  return toB64(bytes.buffer);
}

export function bytesFromB64(b64: string): Uint8Array {
  return new Uint8Array(fromB64(b64));
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson<T>(key: CryptoKey, value: T): Promise<{ ivB64: string; ctB64: string }> {
  const enc = new TextEncoder();
  const iv = randomBytes(12);
  const plaintext = enc.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ivB64: b64OfBytes(iv), ctB64: toB64(ct) };
}

export async function decryptJson<T>(key: CryptoKey, payload: { ivB64: string; ctB64: string }): Promise<T> {
  const dec = new TextDecoder();
  const iv = bytesFromB64(payload.ivB64);
  const ct = fromB64(payload.ctB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(pt)) as T;
}
