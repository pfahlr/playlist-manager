import {
  CreateKeystoreOptions,
  Keystore,
  KeystoreError,
  createKeystore,
  getSealedSecretKeyId,
  isSealedSecret,
} from './crypto';

export {
  createKeystore,
  getSealedSecretKeyId,
  isSealedSecret,
  KeystoreError,
};

export type { CreateKeystoreOptions, Keystore };

export interface ProviderTokenData {
  accountId: number;
  accessToken: string | null | undefined;
  refreshToken: string | null | undefined;
}

export interface ProviderTokenRecord {
  accountId: number;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
}

export interface ProviderTokenRotationResult {
  records: ProviderTokenRecord[];
  updatedIds: number[];
}

const normalize = (value: string | null | undefined): string | null =>
  value ?? null;

export function encryptProviderTokens(
  data: ProviderTokenData,
  keystore: Keystore,
): ProviderTokenRecord {
  const accessToken = normalize(data.accessToken);
  const refreshToken = normalize(data.refreshToken);

  return {
    accountId: data.accountId,
    access_token_ciphertext: accessToken ? keystore.seal(accessToken) : null,
    refresh_token_ciphertext: refreshToken ? keystore.seal(refreshToken) : null,
  };
}

export function decryptProviderTokens(
  record: ProviderTokenRecord,
  keystore: Keystore,
): ProviderTokenData {
  const decode = (value: string | null): string | null => {
    if (!value) {
      return null;
    }

    if (!isSealedSecret(value)) {
      return value;
    }

    return keystore.open(value);
  };

  return {
    accountId: record.accountId,
    accessToken: decode(record.access_token_ciphertext),
    refreshToken: decode(record.refresh_token_ciphertext),
  };
}

export function rotateProviderAccountTokens(
  records: ProviderTokenRecord[],
  source: Keystore,
  target: Keystore,
): ProviderTokenRotationResult {
  const result: ProviderTokenRotationResult = {
    records: [],
    updatedIds: [],
  };

  for (const record of records) {
    let touched = false;

    const rotateValue = (value: string | null): string | null => {
      if (!value) {
        return value;
      }

      if (isSealedSecret(value)) {
        const keyId = getSealedSecretKeyId(value);

        if (keyId === target.keyId) {
          return value;
        }

        if (keyId !== source.keyId) {
          throw new KeystoreError(
            `sealed secret for account ${record.accountId} belongs to unknown key ${keyId}`,
          );
        }

        const plaintext = source.open(value);
        touched = true;
        return target.seal(plaintext);
      }

      touched = true;
      return target.seal(value);
    };

    const rotated: ProviderTokenRecord = {
      accountId: record.accountId,
      access_token_ciphertext: rotateValue(record.access_token_ciphertext),
      refresh_token_ciphertext: rotateValue(record.refresh_token_ciphertext),
    };

    if (touched) {
      result.updatedIds.push(record.accountId);
    }

    result.records.push(rotated);
  }

  return result;
}
