/**
 * End-to-end encryption for cloud sync. Everything uses the browser's Web Crypto API.
 *
 * - The key is derived from the user's sync passphrase with PBKDF2-SHA-256 and a random salt.
 *   The passphrase never leaves the device; the salt is stored (unencrypted) in the cloud so other
 *   devices derive the same key.
 * - Each record is encrypted with AES-256-GCM and a fresh random 96-bit IV. The record id is bound
 *   as additional authenticated data, so ciphertexts cannot be swapped between records.
 * - A "key check" (a known text encrypted with the key) lets a second device verify the passphrase.
 */

export const PBKDF2_ITERATIONS = 600_000
const KEY_CHECK_TEXT = 'kanban-organizer:key-check:v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)))
}

/** Derives a non-extractable AES-GCM key from the passphrase. */
export async function deriveKey(passphrase: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt) as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts a JSON-serializable value. Result: base64(iv ‖ ciphertext). */
export async function encryptJson(key: CryptoKey, recordId: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(recordId) }, key, encoder.encode(JSON.stringify(value))),
  )
  const payload = new Uint8Array(iv.length + ciphertext.length)
  payload.set(iv)
  payload.set(ciphertext, iv.length)
  return toBase64(payload)
}

/** Decrypts a payload created by {@link encryptJson}. Throws if the key or record id does not match. */
export async function decryptJson<T = unknown>(key: CryptoKey, recordId: string, payload: string): Promise<T> {
  const bytes = fromBase64(payload)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(recordId) },
    key,
    bytes.slice(12),
  )
  return JSON.parse(decoder.decode(plaintext)) as T
}

export function createKeyCheck(key: CryptoKey): Promise<string> {
  return encryptJson(key, 'key-check', KEY_CHECK_TEXT)
}

/** True when the key can decrypt the key check, i.e. the passphrase is correct. */
export async function verifyKeyCheck(key: CryptoKey, keyCheck: string): Promise<boolean> {
  try {
    return (await decryptJson<string>(key, 'key-check', keyCheck)) === KEY_CHECK_TEXT
  } catch {
    return false
  }
}
