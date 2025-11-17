import './setup'; // Load test environment
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, createKeystore, isSealedSecret, encryptProviderTokens } from '@app/db';
import { env } from '../../config/env';

// Mock fetch for Spotify API calls
global.fetch = vi.fn();

describe('OAuth Callback Flow - Integration Tests', () => {
  let testUserId: number | undefined;
  let testAccountId: number | undefined;
  let testAttemptId: string | undefined;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test data
    if (testAttemptId) {
      await prisma.oAuthAttempt.deleteMany({
        where: { id: testAttemptId },
      });
    }

    if (testAccountId) {
      await prisma.account.deleteMany({
        where: { id: testAccountId },
      });
    }

    if (testUserId) {
      await prisma.session.deleteMany({
        where: { user_id: testUserId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    }
  });

  describe('Token Encryption Verification', () => {
    it('should store provider tokens ONLY as ciphertext (no plaintext)', async () => {
      // Import the auth functions
      const { findOrCreateUser, linkProviderAccount } = await import(
        '../../lib/auth/users.js'
      );

      // Create a test user
      const user = await findOrCreateUser({
        email: 'test-oauth@example.com',
        name: 'Test OAuth User',
      });
      testUserId = user.id;

      // Simulate linking a provider account with tokens
      const testAccessToken = 'test_access_token_' + Date.now();
      const testRefreshToken = 'test_refresh_token_' + Date.now();

      await linkProviderAccount({
        userId: user.id,
        provider: 'spotify',
        providerUserId: 'spotify_user_123',
        accessToken: testAccessToken,
        refreshToken: testRefreshToken,
        expiresIn: 3600,
      });

      // Query the database directly to verify encryption
      const account = await prisma.account.findFirst({
        where: {
          user_id: user.id,
          provider: 'spotify',
        },
      });

      expect(account).toBeDefined();
      testAccountId = account!.id;

      // CRITICAL: Verify tokens are stored as ciphertext
      expect(account!.access_token_ciphertext).toBeDefined();
      expect(account!.access_token_ciphertext).not.toBeNull();
      expect(account!.refresh_token_ciphertext).toBeDefined();
      expect(account!.refresh_token_ciphertext).not.toBeNull();

      // Verify ciphertext format (should be sealed secret)
      expect(isSealedSecret(account!.access_token_ciphertext!)).toBe(true);
      expect(isSealedSecret(account!.refresh_token_ciphertext!)).toBe(true);

      // Verify plaintext tokens are NOT stored
      const accountRaw: any = account;
      expect(accountRaw.access_token).toBeUndefined(); // Column doesn't exist in schema
      expect(accountRaw.refresh_token).toBeUndefined(); // Column doesn't exist in schema

      // Verify we can decrypt the tokens
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });
      const decryptedAccess = keystore.open(account!.access_token_ciphertext!);
      const decryptedRefresh = keystore.open(account!.refresh_token_ciphertext!);

      expect(decryptedAccess).toBe(testAccessToken);
      expect(decryptedRefresh).toBe(testRefreshToken);

      // Verify ciphertext is different from plaintext (not just base64)
      expect(account!.access_token_ciphertext).not.toBe(testAccessToken);
      expect(account!.refresh_token_ciphertext).not.toBe(testRefreshToken);
      expect(account!.access_token_ciphertext).not.toBe(
        Buffer.from(testAccessToken).toString('base64')
      );
    });

    it('should encrypt tokens with the correct sealed secret format', async () => {
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });

      const plainTokens = {
        accountId: 1,
        accessToken: 'test_access_' + Date.now(),
        refreshToken: 'test_refresh_' + Date.now(),
      };

      const encrypted = encryptProviderTokens(plainTokens, keystore);

      // Verify format: pmse-v1.<keyId>.<payload>
      expect(encrypted.access_token_ciphertext).toMatch(/^pmse-v1\./);
      expect(encrypted.refresh_token_ciphertext).toMatch(/^pmse-v1\./);

      // Verify we can decrypt back
      const decryptedAccess = keystore.open(encrypted.access_token_ciphertext!);
      const decryptedRefresh = keystore.open(encrypted.refresh_token_ciphertext!);

      expect(decryptedAccess).toBe(plainTokens.accessToken);
      expect(decryptedRefresh).toBe(plainTokens.refreshToken);
    });
  });

  describe('End-to-End OAuth Callback Flow', () => {
    it('should complete Spotify OAuth callback with encrypted token storage', async () => {
      const { createAttempt, lookupAttempt } = await import('../../lib/auth/attempts.js');

      // Step 1: Create OAuth attempt (simulating POST /auth/mobile/authorize)
      const codeChallenge = 'test_code_challenge_' + Date.now();
      const redirectUri = 'myapp://oauth/callback';

      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge,
        redirectUri,
        expiresInMinutes: 10,
      });

      testAttemptId = attempt.id;
      expect(attempt.status).toBe('pending');
      expect(attempt.state).toBeDefined();

      // Step 2: Mock Spotify token exchange
      const mockAccessToken = 'spotify_access_' + Date.now();
      const mockRefreshToken = 'spotify_refresh_' + Date.now();

      // Mock the Spotify token exchange API call
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('api.spotify.com/v1/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: mockAccessToken,
                refresh_token: mockRefreshToken,
                expires_in: 3600,
                token_type: 'Bearer',
              }),
          });
        }

        if (url.includes('api.spotify.com/v1/me')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'spotify_user_456',
                email: 'callback-test@example.com',
                display_name: 'Callback Test User',
              }),
          });
        }

        return Promise.reject(new Error('Unexpected fetch call: ' + url));
      });

      // Step 3: Simulate OAuth callback (manually call the handler logic)
      const { findOrCreateUser, linkProviderAccount } = await import(
        '../../lib/auth/users.js'
      );
      const { succeedAttempt } = await import('../../lib/auth/attempts.js');
      const { createSession } = await import('../../lib/auth/sessions.js');

      // Exchange code for tokens (this would normally be done by the callback handler)
      const { exchangeCodeForToken, fetchSpotifyProfile } = await import(
        '../../lib/auth/providers/spotify.js'
      );

      const tokenResponse = await exchangeCodeForToken({
        code: 'test_code_123',
        codeVerifier: codeChallenge,
        redirectUri,
      });

      expect(tokenResponse.access_token).toBe(mockAccessToken);
      expect(tokenResponse.refresh_token).toBe(mockRefreshToken);

      // Fetch user profile
      const profile = await fetchSpotifyProfile(tokenResponse.access_token);
      expect(profile.id).toBe('spotify_user_456');
      expect(profile.email).toBe('callback-test@example.com');

      // Find or create user
      const user = await findOrCreateUser({
        email: profile.email,
        name: profile.display_name,
      });
      testUserId = user.id;

      // Link provider account (this is where encryption happens!)
      await linkProviderAccount({
        userId: user.id,
        provider: 'spotify',
        providerUserId: profile.id,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
      });

      // Create session
      const session = await createSession({
        userId: user.id,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1',
      });

      // Mark attempt as succeeded
      await succeedAttempt(
        attempt.id,
        user.id,
        session.accessToken,
        session.refreshToken,
        tokenResponse.expires_in
      );

      // Step 4: Verify tokens are encrypted in database
      const account = await prisma.account.findFirst({
        where: {
          user_id: user.id,
          provider: 'spotify',
        },
      });

      expect(account).toBeDefined();
      testAccountId = account!.id;

      // CRITICAL: Verify encryption
      expect(account!.access_token_ciphertext).toBeDefined();
      expect(isSealedSecret(account!.access_token_ciphertext!)).toBe(true);
      expect(account!.refresh_token_ciphertext).toBeDefined();
      expect(isSealedSecret(account!.refresh_token_ciphertext!)).toBe(true);

      // Verify we can decrypt
      const keystore = createKeystore({ masterKey: env.MASTER_KEY });
      const decryptedAccess = keystore.open(account!.access_token_ciphertext!);
      const decryptedRefresh = keystore.open(account!.refresh_token_ciphertext!);

      expect(decryptedAccess).toBe(mockAccessToken);
      expect(decryptedRefresh).toBe(mockRefreshToken);

      // Step 5: Verify attempt is marked as succeeded
      const updatedAttempt = await lookupAttempt(attempt.id);
      expect(updatedAttempt!.status).toBe('succeeded');
      expect(updatedAttempt!.accessToken).toBe(session.accessToken);
      expect(updatedAttempt!.refreshToken).toBe(session.refreshToken);

      // Step 6: Verify session JWT is valid
      expect(session.accessToken).toBeDefined();
      expect(session.accessToken).toMatch(/^eyJ/); // JWT format

      const { verifySessionFromHeader } = await import('../../lib/auth/session.js');
      const sessionPayload = verifySessionFromHeader(`Bearer ${session.accessToken}`);

      expect(sessionPayload).toBeDefined();
      expect(sessionPayload!.userId).toBe(user.id);
      expect(sessionPayload!.email).toBe(profile.email);
    });
  });

  describe('Session JWT on Protected Routes', () => {
    it('should allow access to protected routes with valid session JWT', async () => {
      // Create a test user and session
      const { findOrCreateUser } = await import('../../lib/auth/users.js');
      const { createSession } = await import('../../lib/auth/sessions.js');

      const user = await findOrCreateUser({
        email: 'protected-route-test@example.com',
        name: 'Protected Route Test',
      });
      testUserId = user.id;

      const session = await createSession({
        userId: user.id,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1',
      });

      // Verify session JWT works with auth middleware
      const { verifySessionFromHeader } = await import('../../lib/auth/session.js');
      const authHeader = `Bearer ${session.accessToken}`;

      const sessionPayload = verifySessionFromHeader(authHeader);

      expect(sessionPayload).toBeDefined();
      expect(sessionPayload!.userId).toBe(user.id);
      expect(sessionPayload!.email).toBe('protected-route-test@example.com');
      expect(sessionPayload!.provider).toBe('session');
    });

    it('should reject invalid session JWT', async () => {
      const { verifySessionFromHeader } = await import('../../lib/auth/session.js');

      // Test invalid JWT
      const invalidJwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
      const result = verifySessionFromHeader(invalidJwt);

      expect(result).toBeNull();
    });

    it('should reject missing Bearer prefix', async () => {
      const { verifySessionFromHeader } = await import('../../lib/auth/session.js');

      // Create a valid session first
      const { findOrCreateUser } = await import('../../lib/auth/users.js');
      const { createSession } = await import('../../lib/auth/sessions.js');

      const user = await findOrCreateUser({
        email: 'bearer-test@example.com',
        name: 'Bearer Test',
      });
      testUserId = user.id;

      const session = await createSession({
        userId: user.id,
        deviceInfo: 'Test Device',
        ipAddress: '127.0.0.1',
      });

      // Test without Bearer prefix
      const result = verifySessionFromHeader(session.accessToken);
      expect(result).toBeNull();
    });
  });

  describe('Feature Flag - Mocked OAuth Exchange', () => {
    it('should support mocked token exchange for CI testing', async () => {
      // This test verifies we can mock the Spotify exchange for CI
      const originalFetch = global.fetch;

      try {
        // Mock the exchange with a feature flag simulation
        (global.fetch as any).mockImplementation((url: string) => {
          if (url.includes('api.spotify.com/v1/token')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  access_token: 'mocked_access_token',
                  refresh_token: 'mocked_refresh_token',
                  expires_in: 3600,
                  token_type: 'Bearer',
                }),
            });
          }

          if (url.includes('api.spotify.com/v1/me')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  id: 'mocked_user_id',
                  email: 'mocked@example.com',
                  display_name: 'Mocked User',
                }),
            });
          }

          return Promise.reject(new Error('Unexpected fetch: ' + url));
        });

        const { exchangeCodeForToken, fetchSpotifyProfile } = await import(
          '../../lib/auth/providers/spotify.js'
        );

        const tokens = await exchangeCodeForToken({
          code: 'mocked_code',
          codeVerifier: 'mocked_verifier',
          redirectUri: 'http://localhost:3000/callback',
        });

        expect(tokens.access_token).toBe('mocked_access_token');
        expect(tokens.refresh_token).toBe('mocked_refresh_token');

        const profile = await fetchSpotifyProfile(tokens.access_token);
        expect(profile.id).toBe('mocked_user_id');
        expect(profile.email).toBe('mocked@example.com');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
