import { createHash, randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';

export class KeystoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoreError';
  }
}

export interface Keystore {
  readonly keyId: string;
  seal(plaintext: string): string;
  open(sealed: string): string;
}

export interface CreateKeystoreOptions {
  /**
   * Base64 encoded 32-byte secret key. Defaults to process.env.MASTER_KEY.
   */
  masterKey?: string;
}

const SEALED_VERSION = 'pmse-v1';
const SEALED_PREFIX = `${SEALED_VERSION}.`;
const SECRET_KEY_LENGTH = nacl.box.secretKeyLength; // 32 bytes
const PUBLIC_KEY_LENGTH = nacl.box.publicKeyLength; // 32 bytes
const NONCE_LENGTH = nacl.box.nonceLength; // 24 bytes

function decodeMasterKey(encoded: string | undefined): Uint8Array {
  if (!encoded) {
    throw new KeystoreError('MASTER_KEY is required');
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(encoded, 'base64');
  } catch (err) {
    throw new KeystoreError('MASTER_KEY must be base64 encoded');
  }

  if (decoded.length !== SECRET_KEY_LENGTH) {
    throw new KeystoreError(
      `MASTER_KEY must decode to ${SECRET_KEY_LENGTH} bytes`,
    );
  }

  return new Uint8Array(decoded);
}

function deriveKeyId(publicKey: Uint8Array): string {
  const digest = createHash('sha256')
    .update(Buffer.from(publicKey))
    .digest('base64url');
  return digest.slice(0, 16);
}

interface ParsedSealedSecret {
  version: string;
  keyId: string;
  payload: string;
}

function parseSealedSecret(sealed: string): ParsedSealedSecret {
  if (typeof sealed !== 'string' || sealed.length === 0) {
    throw new KeystoreError('sealed secret must be a non-empty string');
  }

  const parts = sealed.split('.', 3);
  if (parts.length !== 3) {
    throw new KeystoreError('sealed secret has an invalid format');
  }

  const [version, keyId, payload] = parts;
  if (!version || !keyId || !payload) {
    throw new KeystoreError('sealed secret is missing components');
  }

  return { version, keyId, payload };
}

function decodePayload(payload: string): Buffer {
  try {
    return Buffer.from(payload, 'base64url');
  } catch (err) {
    throw new KeystoreError('sealed secret payload is not valid base64url');
  }
}

export function getSealedSecretKeyId(sealed: string): string {
  const { version, keyId } = parseSealedSecret(sealed);
  if (version !== SEALED_VERSION) {
    throw new KeystoreError('unsupported sealed secret version');
  }
  return keyId;
}

export function isSealedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(SEALED_PREFIX);
}

export function createKeystore(
  options: CreateKeystoreOptions = {},
): Keystore {
  const secretKey = decodeMasterKey(options.masterKey ?? process.env.MASTER_KEY);
  const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
  const keyId = deriveKeyId(keyPair.publicKey);

  return {
    keyId,
    seal(plaintext: string): string {
      if (typeof plaintext !== 'string') {
        throw new KeystoreError('plain secret must be a string');
      }

      const message = Buffer.from(plaintext, 'utf8');
      const nonce = randomBytes(NONCE_LENGTH);
      const ephemeral = nacl.box.keyPair();
      const cipher = nacl.box(
        new Uint8Array(message),
        new Uint8Array(nonce),
        keyPair.publicKey,
        ephemeral.secretKey,
      );

      if (!cipher) {
        throw new KeystoreError('failed to seal secret');
      }

      const payload = Buffer.concat([
        Buffer.from(ephemeral.publicKey),
        Buffer.from(nonce),
        Buffer.from(cipher),
      ]);

      return `${SEALED_VERSION}.${keyId}.${payload.toString('base64url')}`;
    },
    open(sealed: string): string {
      const parsed = parseSealedSecret(sealed);
      if (parsed.version !== SEALED_VERSION) {
        throw new KeystoreError('unsupported sealed secret version');
      }

      if (parsed.keyId !== keyId) {
        throw new KeystoreError(
          `sealed secret uses key ${parsed.keyId}, expected ${keyId}`,
        );
      }

      const payload = decodePayload(parsed.payload);

      if (
        payload.length <
        PUBLIC_KEY_LENGTH + NONCE_LENGTH + nacl.box.overheadLength
      ) {
        throw new KeystoreError('sealed secret payload is truncated');
      }

      const ephemeralPublic = payload.subarray(0, PUBLIC_KEY_LENGTH);
      const nonce = payload.subarray(PUBLIC_KEY_LENGTH, PUBLIC_KEY_LENGTH + NONCE_LENGTH);
      const ciphertext = payload.subarray(PUBLIC_KEY_LENGTH + NONCE_LENGTH);

      const plaintext = nacl.box.open(
        new Uint8Array(ciphertext),
        new Uint8Array(nonce),
        new Uint8Array(ephemeralPublic),
        secretKey,
      );

      if (!plaintext) {
        throw new KeystoreError('failed to open sealed secret');
      }

      return Buffer.from(plaintext).toString('utf8');
    },
  };
}

export const __testing = {
  SEALED_PREFIX,
  SEALED_VERSION,
};
