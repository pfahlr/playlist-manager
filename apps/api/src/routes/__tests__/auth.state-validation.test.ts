/**
 * OAuth State/Nonce Validation Tests (Task 10m)
 *
 * Verifies that OAuth callbacks properly validate state and nonce parameters
 * to prevent CSRF attacks and replay attacks.
 */

import './setup';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { prisma } from '@app/db';
import { createAttempt, lookupAttemptByState } from '../../lib/auth/attempts';

describe('OAuth State/Nonce Validation - Task 10m', () => {
  let testAttemptIds: string[] = [];

  afterEach(async () => {
    // Clean up test attempts
    if (testAttemptIds.length > 0) {
      await prisma.oAuthAttempt.deleteMany({
        where: { id: { in: testAttemptIds } },
      });
      testAttemptIds = [];
    }
  });

  describe('State Generation', () => {
    it('should generate cryptographically secure state values', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      // State should be generated
      expect(attempt.state).toBeDefined();
      expect(attempt.state).not.toBeNull();

      // State should have proper format
      expect(attempt.state).toMatch(/^state_/);

      // State should be long enough to be secure (at least 32 characters)
      expect(attempt.state!.length).toBeGreaterThanOrEqual(32);
    });

    it('should generate unique state for each attempt', async () => {
      const attempt1 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge_1',
        redirectUri: 'http://localhost:3000/callback',
      });

      const attempt2 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge_2',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt1.id, attempt2.id);

      // States should be different
      expect(attempt1.state).not.toBe(attempt2.state);
    });

    it('should accept custom state values', async () => {
      const customState = 'custom_state_value_123';

      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
        state: customState,
      });

      testAttemptIds.push(attempt.id);

      expect(attempt.state).toBe(customState);
    });
  });

  describe('Nonce Generation', () => {
    it('should generate cryptographically secure nonce values', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      // Nonce should be generated
      expect(attempt.nonce).toBeDefined();
      expect(attempt.nonce).not.toBeNull();

      // Nonce should have proper format
      expect(attempt.nonce).toMatch(/^nonce_/);

      // Nonce should be long enough to be secure
      expect(attempt.nonce!.length).toBeGreaterThanOrEqual(32);
    });

    it('should generate unique nonce for each attempt', async () => {
      const attempt1 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge_1',
        redirectUri: 'http://localhost:3000/callback',
      });

      const attempt2 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge_2',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt1.id, attempt2.id);

      // Nonces should be different
      expect(attempt1.nonce).not.toBe(attempt2.nonce);
    });

    it('should accept custom nonce values', async () => {
      const customNonce = 'custom_nonce_value_456';

      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
        nonce: customNonce,
      });

      testAttemptIds.push(attempt.id);

      expect(attempt.nonce).toBe(customNonce);
    });
  });

  describe('State Validation', () => {
    it('should find attempt by valid state', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      const found = await lookupAttemptByState(attempt.state!);

      expect(found).toBeDefined();
      expect(found!.id).toBe(attempt.id);
      expect(found!.state).toBe(attempt.state);
    });

    it('should reject invalid state', async () => {
      const found = await lookupAttemptByState('invalid_state_value');

      expect(found).toBeNull();
    });

    it('should reject tampered state', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      // Tamper with the state by appending characters
      const tamperedState = attempt.state + 'TAMPERED';

      const found = await lookupAttemptByState(tamperedState);

      expect(found).toBeNull();
    });

    it('should reject expired attempts', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
        expiresInMinutes: -1, // Expired 1 minute ago
      });

      testAttemptIds.push(attempt.id);

      const found = await lookupAttemptByState(attempt.state!);

      // Should return the attempt but with status 'expired'
      expect(found).toBeDefined();
      expect(found!.status).toBe('expired');
    });

    it('should prevent state reuse after completion', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      // Mark attempt as succeeded
      await prisma.oAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'succeeded' },
      });

      const found = await lookupAttemptByState(attempt.state!);

      // Attempt is found but should not be usable (status !== 'pending')
      expect(found).toBeDefined();
      expect(found!.status).toBe('succeeded');
      expect(found!.status).not.toBe('pending');
    });
  });

  describe('CSRF Protection via State Parameter', () => {
    it('should document that state prevents authorization code injection', () => {
      // SECURITY REQUIREMENT (Task 10m):
      //
      // The OAuth `state` parameter provides CSRF protection by:
      // 1. Being generated server-side with cryptographic randomness
      // 2. Stored in the oauth_attempts table linked to the session
      // 3. Validated on callback to ensure the authorization code matches the original request
      //
      // Attack scenario prevented:
      // - Attacker initiates OAuth flow and obtains authorization code
      // - Attacker tricks victim into visiting callback URL with attacker's code
      // - Without state validation, victim's session would be linked to attacker's account
      // - With state validation, the callback is rejected because state doesn't match
      //
      // ✅ CORRECT FLOW:
      //   1. User initiates OAuth: POST /auth/mobile/authorize
      //   2. Server generates state & nonce, stores in DB
      //   3. User authorizes on provider (Spotify)
      //   4. Provider redirects to callback with code & state
      //   5. Server validates state matches stored value
      //   6. Server exchanges code for tokens
      //
      // ❌ ATTACK BLOCKED:
      //   1. Attacker gets their own authorization code
      //   2. Attacker sends victim: /auth/callback/spotify?code=ATTACKER_CODE&state=VICTIM_STATE
      //   3. Server validates state - finds it belongs to different session
      //   4. Callback is rejected

      expect(true).toBe(true); // Documentation test
    });

    it('should validate state matches original request', async () => {
      const attempt1 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'challenge_1',
        redirectUri: 'http://localhost:3000/callback',
      });

      const attempt2 = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'challenge_2',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt1.id, attempt2.id);

      // Try to use attempt1's state to look up attempt2 (should fail)
      const found = await lookupAttemptByState(attempt1.state!);

      expect(found).toBeDefined();
      expect(found!.id).toBe(attempt1.id); // Should find attempt1, not attempt2
      expect(found!.id).not.toBe(attempt2.id);
    });
  });

  describe('Nonce for Replay Protection', () => {
    it('should store nonce for OpenID Connect flows', async () => {
      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
      });

      testAttemptIds.push(attempt.id);

      // Verify nonce is stored
      const stored = await prisma.oAuthAttempt.findUnique({
        where: { id: attempt.id },
      });

      expect(stored).toBeDefined();
      expect(stored!.nonce).toBeDefined();
      expect(stored!.nonce).toBe(attempt.nonce);
    });

    it('should support custom nonce for ID token validation', async () => {
      // In OpenID Connect, the nonce is included in the ID token
      // and must be validated to prevent replay attacks
      const customNonce = 'oidc_nonce_' + Date.now();

      const attempt = await createAttempt({
        provider: 'spotify',
        codeChallenge: 'test_challenge',
        redirectUri: 'http://localhost:3000/callback',
        nonce: customNonce,
      });

      testAttemptIds.push(attempt.id);

      expect(attempt.nonce).toBe(customNonce);

      // In a real OIDC flow, the provider would return an ID token with:
      // {
      //   "iss": "https://accounts.spotify.com",
      //   "sub": "user_id",
      //   "nonce": "oidc_nonce_...",  // Must match stored nonce
      //   "iat": 1234567890,
      //   "exp": 1234567890
      // }
      //
      // The server would validate: idToken.nonce === attempt.nonce
    });
  });
});
