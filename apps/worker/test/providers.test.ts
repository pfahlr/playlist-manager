import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@app/db';
import { createKeystore, encryptProviderTokens } from '@app/db/encryption';
import { getProviderAuthForUser, MissingProviderAuthError } from '../src/providers';

describe('Provider Token Encryption Integration', () => {
  const TEST_USER_ID = 999999;
  const TEST_PROVIDER = 'spotify';
  const TEST_ACCESS_TOKEN = 'test-access-token-plaintext';
  const TEST_REFRESH_TOKEN = 'test-refresh-token-plaintext';
  const TEST_MASTER_KEY = 'test-master-key-for-integration-tests-minimum-32-chars-long';

  let testAccountId: number;

  beforeAll(async () => {
    // Set MASTER_KEY for the test environment
    process.env.MASTER_KEY = TEST_MASTER_KEY;

    // Create a test user
    const user = await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      create: {
        id: TEST_USER_ID,
        email: `test-${TEST_USER_ID}@example.com`,
        name: 'Test User for Token Encryption',
      },
      update: {},
    });

    // Create encrypted tokens
    const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });
    const encrypted = encryptProviderTokens(
      {
        accountId: 0, // Will be set by database
        accessToken: TEST_ACCESS_TOKEN,
        refreshToken: TEST_REFRESH_TOKEN,
      },
      keystore
    );

    // Create account with encrypted tokens
    const account = await prisma.account.create({
      data: {
        user_id: user.id,
        provider: TEST_PROVIDER,
        provider_user_id: 'test-spotify-user-id',
        access_token_ciphertext: encrypted.access_token_ciphertext,
        refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
      },
    });

    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testAccountId) {
      await prisma.account.delete({ where: { id: testAccountId } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  });

  it('should decrypt and return access token for valid user+provider', async () => {
    const auth = await getProviderAuthForUser(TEST_USER_ID, TEST_PROVIDER);

    expect(auth).toBeDefined();
    expect(auth.token).toBe(TEST_ACCESS_TOKEN);
  });

  it('should throw MissingProviderAuthError when user has no account for provider', async () => {
    const nonExistentUserId = 999998;

    await expect(
      getProviderAuthForUser(nonExistentUserId, 'deezer')
    ).rejects.toThrow(MissingProviderAuthError);
  });

  it('should throw MissingProviderAuthError when account exists but token is null', async () => {
    // Create account with null tokens
    const userWithNullTokens = await prisma.user.create({
      data: {
        email: 'null-tokens@example.com',
        name: 'Null Tokens User',
      },
    });

    const accountWithNullTokens = await prisma.account.create({
      data: {
        user_id: userWithNullTokens.id,
        provider: 'tidal',
        provider_user_id: 'null-tokens-tidal-id',
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
      },
    });

    await expect(
      getProviderAuthForUser(userWithNullTokens.id, 'tidal')
    ).rejects.toThrow(MissingProviderAuthError);

    // Cleanup
    await prisma.account.delete({ where: { id: accountWithNullTokens.id } });
    await prisma.user.delete({ where: { id: userWithNullTokens.id } });
  });

  it('should handle encryption/decryption round-trip correctly', async () => {
    // This test verifies that we can encrypt and decrypt tokens end-to-end
    const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });
    const originalToken = 'original-access-token-12345';

    // Encrypt
    const encrypted = encryptProviderTokens(
      {
        accountId: 1,
        accessToken: originalToken,
        refreshToken: 'refresh-token',
      },
      keystore
    );

    expect(encrypted.access_token_ciphertext).toBeTruthy();
    expect(encrypted.access_token_ciphertext).not.toBe(originalToken);

    // Store in DB
    const tempUser = await prisma.user.create({
      data: {
        email: 'roundtrip@example.com',
        name: 'Roundtrip Test User',
      },
    });

    const tempAccount = await prisma.account.create({
      data: {
        user_id: tempUser.id,
        provider: 'youtube',
        provider_user_id: 'roundtrip-youtube-id',
        access_token_ciphertext: encrypted.access_token_ciphertext,
        refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
      },
    });

    // Fetch and decrypt via getProviderAuthForUser
    const auth = await getProviderAuthForUser(tempUser.id, 'youtube');

    expect(auth.token).toBe(originalToken);

    // Cleanup
    await prisma.account.delete({ where: { id: tempAccount.id } });
    await prisma.user.delete({ where: { id: tempUser.id } });
  });
});
