import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  createKeystore,
  getSealedSecretKeyId,
  KeystoreError,
} from '../keystore';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const makeMasterKey = () => randomBytes(32).toString('base64');

describe('createKeystore', () => {
  let masterKey: string;

  beforeEach(() => {
    masterKey = makeMasterKey();
    process.env.MASTER_KEY = masterKey;
  });

  it('seals and opens secrets with the same master key', () => {
    const keystore = createKeystore();
    const secret = 'refresh-token-123';

    const sealed = keystore.seal(secret);
    expect(sealed).not.toContain(secret);
    expect(getSealedSecretKeyId(sealed)).toBe(keystore.keyId);

    const opened = keystore.open(sealed);
    expect(opened).toBe(secret);
  });

  it('throws when MASTER_KEY is missing', () => {
    delete process.env.MASTER_KEY;
    expect(() => createKeystore()).toThrow(/MASTER_KEY/i);
  });

  it('throws when MASTER_KEY is not 32 bytes of base64', () => {
    process.env.MASTER_KEY = 'invalid';
    expect(() => createKeystore()).toThrow(/MASTER_KEY/i);
  });

  it('fails to open with a different master key', () => {
    const keystore = createKeystore();
    const sealed = keystore.seal('sensitive');

    process.env.MASTER_KEY = makeMasterKey();
    const other = createKeystore();

    expect(() => other.open(sealed)).toThrow(KeystoreError);
  });

  it('detects tampering and throws', () => {
    const keystore = createKeystore();
    const sealed = keystore.seal('keep-me-safe');
    const tampered = sealed.replace(/.$/, (c) =>
      c === 'A' ? 'B' : 'A',
    );

    expect(() => keystore.open(tampered)).toThrow(KeystoreError);
  });
});
