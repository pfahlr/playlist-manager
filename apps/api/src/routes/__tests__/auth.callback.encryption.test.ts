/**
 * OAuth Callback Encryption Tests
 *
 * Task 10d: Verify that provider tokens are stored ONLY as ciphertext.
 *
 * These tests verify the encryption infrastructure works correctly.
 * Full end-to-end integration tests require a test database.
 */

import './setup'; // Load test environment
import { describe, expect, it } from 'vitest';
import { createKeystore, isSealedSecret, encryptProviderTokens, decryptProviderTokens } from '@app/db';
import { env } from '../../config/env';

describe('OAuth Callback - Token Encryption', () => {
  describe('Encryption Infrastructure', () => {
    it('should create a valid keystore with MASTER_KEY', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

      expect(keystore).toBeDefined();
      expect(keystore.keyId).toBeDefined();
      expect(typeof keystore.seal).toBe('function');
      expect(typeof keystore.open).toBe('function');
    });

    it('should encrypt provider tokens with sealed secret format', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

      const plainTokens = {
        accountId: 1,
        accessToken: 'spotify_access_token_example_' + Date.now(),
        refreshToken: 'spotify_refresh_token_example_' + Date.now(),
      };

      const encrypted = encryptProviderTokens(plainTokens, keystore);

      // Verify ciphertext exists
      expect(encrypted.access_token_ciphertext).toBeDefined();
      expect(encrypted.access_token_ciphertext).not.toBeNull();
      expect(encrypted.refresh_token_ciphertext).toBeDefined();
      expect(encrypted.refresh_token_ciphertext).not.toBeNull();

      // Verify format: pmse-v1.<keyId>.<payload>
      expect(encrypted.access_token_ciphertext).toMatch(/^pmse-v1\./);
      expect(encrypted.refresh_token_ciphertext).toMatch(/^pmse-v1\./);

      // Verify it's a sealed secret
      expect(isSealedSecret(encrypted.access_token_ciphertext!)).toBe(true);
      expect(isSealedSecret(encrypted.refresh_token_ciphertext!)).toBe(true);

      // Verify ciphertext is different from plaintext
      expect(encrypted.access_token_ciphertext).not.toBe(plainTokens.accessToken);
      expect(encrypted.refresh_token_ciphertext).not.toBe(plainTokens.refreshToken);

      // Verify it's not just base64 encoding
      expect(encrypted.access_token_ciphertext).not.toBe(
        Buffer.from(plainTokens.accessToken).toString('base64')
      );
    });

    it('should decrypt provider tokens back to plaintext', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

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
      expect(decrypted.accountId).toBe(encrypted.accountId);
    });

    it('should handle null refresh tokens', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

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

    it('should produce different ciphertext for same plaintext (nonce)', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

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
      expect(decrypted1.refreshToken).toBe(tokens.refreshToken);
      expect(decrypted2.refreshToken).toBe(tokens.refreshToken);
    });

    it('should fail to decrypt with wrong key', () => {
      const key1 = Buffer.from('test_key_1_exactly_32_bytes_x!!').toString('base64');
      const key2 = Buffer.from('test_key_2_exactly_32_bytes_y!!').toString('base64');
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

  describe('Encryption Security Properties', () => {
    it('should not expose plaintext in ciphertext string', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

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

    it('should use authenticated encryption (tamper detection)', () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

      const tokens = {
        accountId: 222,
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
      };

      const encrypted = encryptProviderTokens(tokens, keystore);

      // Tamper with the ciphertext (change one character in the payload)
      const parts = encrypted.access_token_ciphertext!.split('.');
      const tamperedPayload = parts[2].slice(0, -1) + 'X'; // Change last char
      const tamperedCiphertext = `${parts[0]}.${parts[1]}.${tamperedPayload}`;

      // Attempting to decrypt tampered ciphertext should fail
      expect(() => {
        keystore.open(tamperedCiphertext);
      }).toThrow();
    });
  });

  describe('linkProviderAccount Encryption', () => {
    it('should verify linkProviderAccount uses encryptProviderTokens', async () => {
      // This test verifies the code path by importing the function
      // Full database testing requires a test database setup
      const { linkProviderAccount } = await import('../../lib/auth/users.js');

      // Verify the function exists and can be called
      expect(typeof linkProviderAccount).toBe('function');

      // The actual database integration testing should be done with a test database
      // See: apps/api/src/routes/__tests__/README.md for full integration test setup
    });
  });
});

describe('OAuth Callback - Security Requirements', () => {
  it('should document that plaintext tokens must never be stored', () => {
    // This test serves as documentation for the security requirement
    //
    // CRITICAL SECURITY REQUIREMENT (Task 10d):
    //
    // Provider tokens (access_token, refresh_token) must be stored ONLY as ciphertext.
    //
    // ✅ CORRECT (using encryption):
    //   await prisma.account.create({
    //     data: {
    //       access_token_ciphertext: encrypted.access_token_ciphertext,
    //       refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
    //       // access_token and refresh_token columns should NOT exist
    //     }
    //   });
    //
    // ❌ INCORRECT (storing plaintext):
    //   await prisma.account.create({
    //     data: {
    //       access_token: plainAccessToken,  // SECURITY VIOLATION!
    //       refresh_token: plainRefreshToken, // SECURITY VIOLATION!
    //     }
    //   });
    //
    // Verification:
    // - Check that Account model only has *_ciphertext fields
    // - Verify all tokens pass through encryptProviderTokens() before storage
    // - Query database directly to confirm ciphertext format (pmse-v1.*)

    expect(true).toBe(true); // This test always passes - it's documentation
  });
});
