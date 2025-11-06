import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createKeystore,
  decryptProviderTokens,
  encryptProviderTokens,
  rotateProviderAccountTokens,
} from '../src/encryption';

const makeKey = () => randomBytes(32).toString('base64');

describe('provider token rotation', () => {
  it('re-encrypts tokens sealed with an old key and leaves fresh tokens untouched', () => {
    const oldKey = createKeystore({ masterKey: makeKey() });
    const newKey = createKeystore({ masterKey: makeKey() });

    const accountA = encryptProviderTokens(
      { accountId: 1, accessToken: 'acc-A', refreshToken: 'ref-A' },
      oldKey,
    );

    const accountB = encryptProviderTokens(
      { accountId: 2, accessToken: 'acc-B', refreshToken: 'ref-B' },
      newKey,
    );

    const accountC = {
      accountId: 3,
      access_token_ciphertext: 'legacy-access',
      refresh_token_ciphertext: 'legacy-refresh',
    };

    const rotated = rotateProviderAccountTokens(
      [accountA, accountB, accountC],
      oldKey,
      newKey,
    );

    expect(rotated.updatedIds).toEqual([1, 3]);

    const decryptedA = decryptProviderTokens(
      rotated.records.find((r) => r.accountId === 1)!,
      newKey,
    );
    expect(decryptedA).toEqual({
      accountId: 1,
      accessToken: 'acc-A',
      refreshToken: 'ref-A',
    });

    const decryptedB = decryptProviderTokens(
      rotated.records.find((r) => r.accountId === 2)!,
      newKey,
    );
    expect(decryptedB).toEqual({
      accountId: 2,
      accessToken: 'acc-B',
      refreshToken: 'ref-B',
    });

    const decryptedC = decryptProviderTokens(
      rotated.records.find((r) => r.accountId === 3)!,
      newKey,
    );
    expect(decryptedC).toEqual({
      accountId: 3,
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
    });
  });

  it('is idempotent when run multiple times', () => {
    const oldKey = createKeystore({ masterKey: makeKey() });
    const newKey = createKeystore({ masterKey: makeKey() });

    const initial = [
      encryptProviderTokens(
        { accountId: 42, accessToken: 'foo', refreshToken: 'bar' },
        oldKey,
      ),
    ];

    const firstPass = rotateProviderAccountTokens(initial, oldKey, newKey);
    const secondPass = rotateProviderAccountTokens(firstPass.records, oldKey, newKey);

    expect(firstPass.updatedIds).toEqual([42]);
    expect(secondPass.updatedIds).toEqual([]);

    const decrypted = decryptProviderTokens(secondPass.records[0], newKey);
    expect(decrypted).toEqual({
      accountId: 42,
      accessToken: 'foo',
      refreshToken: 'bar',
    });
  });
});
