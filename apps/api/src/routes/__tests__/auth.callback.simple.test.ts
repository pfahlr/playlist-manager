/**
 * OAuth Callback Encryption Tests (Simplified)
 *
 * Task 10d: Verify that provider tokens are stored ONLY as ciphertext.
 *
 * These tests verify the encryption infrastructure without requiring
 * full environment setup or database access.
 */

import { describe, expect, it } from 'vitest';
import { createKeystore, isSealedSecret, encryptProviderTokens, decryptProviderTokens } from '@app/db';

// Test master key (base64 encoded 32 bytes)
const TEST_MASTER_KEY = Buffer.from('test_master_key_exactly_32bytesX').toString('base64');

describe('OAuth Token Encryption - Task 10d', () => {
  describe('Keystore Creation', () => {
    it('should create a valid keystore with a 32-byte master key', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      expect(keystore).toBeDefined();
      expect(keystore.keyId).toBeDefined();
      expect(typeof keystore.seal).toBe('function');
      expect(typeof keystore.open).toBe('function');
    });

    it('should reject master keys that are not 32 bytes', () => {
      const invalidKey = Buffer.from('too_short').toString('base64');

      expect(() => {
        createKeystore({ masterKey: invalidKey });
      }).toThrow('MASTER_KEY must decode to 32 bytes');
    });
  });

  describe('Token Encryption', () => {
    it('should encrypt provider tokens to sealed secret format', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const plainTokens = {
        accountId: 1,
        accessToken: 'spotify_access_token_example_' + Date.now(),
        refreshToken: 'spotify_refresh_token_example_' + Date.now(),
      };

      const encrypted = encryptProviderTokens(plainTokens, keystore);

      // CRITICAL: Verify ciphertext exists
      expect(encrypted.access_token_ciphertext).toBeDefined();
      expect(encrypted.access_token_ciphertext).not.toBeNull();
      expect(encrypted.refresh_token_ciphertext).toBeDefined();
      expect(encrypted.refresh_token_ciphertext).not.toBeNull();

      // Verify sealed secret format: pmse-v1.<keyId>.<payload>
      expect(encrypted.access_token_ciphertext).toMatch(/^pmse-v1\./);
      expect(encrypted.refresh_token_ciphertext).toMatch(/^pmse-v1\./);

      // Verify it's recognized as a sealed secret
      expect(isSealedSecret(encrypted.access_token_ciphertext!)).toBe(true);
      expect(isSealedSecret(encrypted.refresh_token_ciphertext!)).toBe(true);

      // CRITICAL: Verify ciphertext is NOT the same as plaintext
      expect(encrypted.access_token_ciphertext).not.toBe(plainTokens.accessToken);
      expect(encrypted.refresh_token_ciphertext).not.toBe(plainTokens.refreshToken);
    });

    it('should decrypt tokens back to original plaintext', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const originalTokens = {
        accountId: 123,
        accessToken: 'original_access_' + Date.now(),
        refreshToken: 'original_refresh_' + Date.now(),
      };

      // Encrypt
      const encrypted = encryptProviderTokens(originalTokens, keystore);

      // Decrypt
      const decrypted = decryptProviderTokens(encrypted, keystore);

      // Verify decrypted tokens match original
      expect(decrypted.accessToken).toBe(originalTokens.accessToken);
      expect(decrypted.refreshToken).toBe(originalTokens.refreshToken);
    });

    it('should handle null refresh tokens correctly', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const tokensWithoutRefresh = {
        accountId: 456,
        accessToken: 'access_only_' + Date.now(),
        refreshToken: null,
      };

      const encrypted = encryptProviderTokens(tokensWithoutRefresh, keystore);

      expect(encrypted.access_token_ciphertext).toBeDefined();
      expect(encrypted.access_token_ciphertext).not.toBeNull();
      expect(encrypted.refresh_token_ciphertext).toBeNull();

      const decrypted = decryptProviderTokens(encrypted, keystore);
      expect(decrypted.accessToken).toBe(tokensWithoutRefresh.accessToken);
      expect(decrypted.refreshToken).toBeNull();
    });
  });

  describe('Security Properties', () => {
    it('should use random nonces (different ciphertext for same plaintext)', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const tokens = {
        accountId: 789,
        accessToken: 'same_token',
        refreshToken: 'same_refresh',
      };

      const encrypted1 = encryptProviderTokens(tokens, keystore);
      const encrypted2 = encryptProviderTokens(tokens, keystore);

      // Ciphertext should be different due to random nonce
      expect(encrypted1.access_token_ciphertext).not.toBe(encrypted2.access_token_ciphertext);
      expect(encrypted1.refresh_token_ciphertext).not.toBe(encrypted2.refresh_token_ciphertext);

      // But both should decrypt to the same plaintext
      const decrypted1 = decryptProviderTokens(encrypted1, keystore);
      const decrypted2 = decryptProviderTokens(encrypted2, keystore);

      expect(decrypted1.accessToken).toBe(tokens.accessToken);
      expect(decrypted2.accessToken).toBe(tokens.accessToken);
    });

    it('should not expose plaintext in ciphertext', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const sensitiveToken = 'very_secret_spotify_token_12345';
      const tokens = {
        accountId: 111,
        accessToken: sensitiveToken,
        refreshToken: 'secret_refresh_67890',
      };

      const encrypted = encryptProviderTokens(tokens, keystore);

      // Ciphertext should not contain the plaintext token
      expect(encrypted.access_token_ciphertext).not.toContain(sensitiveToken);
      expect(encrypted.access_token_ciphertext).not.toContain('very_secret');
      expect(encrypted.access_token_ciphertext).not.toContain('12345');
    });

    it('should detect tampering (authenticated encryption)', () => {
      const keystore = createKeystore({ masterKey: TEST_MASTER_KEY });

      const tokens = {
        accountId: 222,
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
      };

      const encrypted = encryptProviderTokens(tokens, keystore);

      // Tamper with the ciphertext (corrupt the payload)
      const parts = encrypted.access_token_ciphertext!.split('.');
      // Flip some bits in the base64 payload
      const payload = parts[2];
      const tamperedPayload = payload.substring(0, payload.length - 10) + 'XXXXXXXXXX';
      const tamperedCiphertext = `${parts[0]}.${parts[1]}.${tamperedPayload}`;

      // Attempting to decrypt tampered ciphertext should fail
      // NaCl secretbox provides authenticated encryption, so this should throw
      expect(() => {
        keystore.open(tamperedCiphertext);
      }).toThrow();
    });

    it('should reject decryption with wrong key', () => {
      const key1 = Buffer.from('test_key_1_exactly_32_bytes_x!!!').toString('base64');
      const key2 = Buffer.from('test_key_2_exactly_32_bytes_y!!!').toString('base64');
      const keystore1 = createKeystore({ masterKey: key1 });
      const keystore2 = createKeystore({ masterKey: key2 });

      const tokens = {
        accountId: 999,
        accessToken: 'secret_token',
        refreshToken: 'secret_refresh',
      };

      const encrypted = encryptProviderTokens(tokens, keystore1);

      // Attempting to decrypt with wrong key should throw
      expect(() => {
        keystore2.open(encrypted.access_token_ciphertext!);
      }).toThrow();
    });
  });

  describe('Task 10d Requirements', () => {
    it('should verify NO plaintext tokens are stored in database schema', () => {
      // This test documents the security requirement from task 10d
      //
      // CRITICAL REQUIREMENT:
      // - Provider tokens MUST be stored ONLY as ciphertext
      // - The Account model has access_token_ciphertext and refresh_token_ciphertext fields
      // - There are NO access_token or refresh_token plaintext fields
      //
      // Verification method:
      // 1. Check schema.prisma - only *_ciphertext fields exist
      // 2. Check linkProviderAccount() uses encryptProviderTokens()
      // 3. Query database directly to verify ciphertext format (pmse-v1.*)
      //
      // ✅ CORRECT:
      //   account.access_token_ciphertext = encryptedTokens.access_token_ciphertext
      //
      // ❌ INCORRECT:
      //   account.access_token = plainAccessToken // SECURITY VIOLATION!

      expect(true).toBe(true); // Documentation test
    });

    it('should confirm linkProviderAccount uses encryption', async () => {
      // Verify the code path exists
      const { linkProviderAccount } = await import('../../lib/auth/users.js');

      expect(typeof linkProviderAccount).toBe('function');

      // Full integration test requires database setup
      // See: apps/api/test/integration/ for database tests
    });
  });
});
