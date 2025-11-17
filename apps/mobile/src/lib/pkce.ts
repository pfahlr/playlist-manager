import * as Crypto from 'expo-crypto';

/**
 * Generate a random code verifier for PKCE
 * Must be 43-128 characters, URL-safe base64 encoding
 */
export function generateCodeVerifier(): string {
  const randomBytes = Crypto.getRandomBytes(32);
  return base64URLEncode(randomBytes);
}

/**
 * Generate code challenge from code verifier
 * Uses SHA256 hashing as per PKCE specification
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  return base64URLEncode(Buffer.from(hashed, 'base64'));
}

/**
 * Convert buffer to base64 URL-safe encoding
 * Replaces +/= characters as per RFC 7636
 */
function base64URLEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
