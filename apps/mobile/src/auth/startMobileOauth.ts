import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api';
import { generateCodeVerifier, generateCodeChallenge } from '../lib/pkce';

// Configure WebBrowser for auth flows
WebBrowser.maybeCompleteAuthSession();

export interface OAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
  errorDescription?: string;
}

/**
 * Start OAuth flow for mobile app with PKCE
 * Opens system browser for authentication, polls for completion
 */
export async function startMobileOauth(
  provider: 'spotify' | 'deezer' | 'tidal' | 'youtube'
): Promise<OAuthResult> {
  try {
    // Get the redirect URL for this app (pm://auth/callback)
    const redirectUri = Linking.createURL('auth/callback');

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    console.log('[OAuth] Starting flow:', { provider, redirectUri });

    // Store code verifier securely for later use
    // Note: In the current backend implementation (task 10d), we use code_challenge as verifier
    // This is a simplified workaround. In production, we'd send verifier separately.
    await SecureStore.setItemAsync(`oauth_verifier_${provider}`, codeVerifier);

    // Step 1: Initialize OAuth attempt with backend
    const { data: initData, error: initError } = await apiClient.POST('/auth/mobile/authorize', {
      body: {
        provider,
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
      },
    });

    if (initError || !initData) {
      console.error('[OAuth] Failed to initialize:', initError);
      return {
        success: false,
        error: 'initialization_failed',
        errorDescription: 'Failed to initialize OAuth flow',
      };
    }

    const { attempt_id, authorization_url } = initData;
    console.log('[OAuth] Attempt created:', attempt_id);

    // Step 2: Open browser for user authentication
    const browserResult = await WebBrowser.openAuthSessionAsync(
      authorization_url,
      redirectUri
    );

    if (browserResult.type === 'cancel') {
      console.log('[OAuth] User cancelled');
      return {
        success: false,
        error: 'user_cancelled',
        errorDescription: 'User cancelled the authorization',
      };
    }

    if (browserResult.type === 'dismiss') {
      console.log('[OAuth] Browser dismissed');
      return {
        success: false,
        error: 'browser_dismissed',
        errorDescription: 'Browser was dismissed',
      };
    }

    // Step 3: Poll for OAuth completion
    console.log('[OAuth] Polling for completion...');
    const pollResult = await pollOAuthAttempt(attempt_id);

    if (pollResult.success && pollResult.accessToken) {
      // Store tokens securely
      await SecureStore.setItemAsync('session_token', pollResult.accessToken);
      if (pollResult.refreshToken) {
        await SecureStore.setItemAsync('refresh_token', pollResult.refreshToken);
      }

      // Clean up code verifier
      await SecureStore.deleteItemAsync(`oauth_verifier_${provider}`);
    }

    return pollResult;
  } catch (error) {
    console.error('[OAuth] Unexpected error:', error);
    return {
      success: false,
      error: 'unexpected_error',
      errorDescription: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Poll OAuth attempt status until completion or timeout
 * Polls every 2 seconds for up to 60 seconds
 */
async function pollOAuthAttempt(attemptId: string): Promise<OAuthResult> {
  const maxAttempts = 30; // 60 seconds total (2s * 30)
  const pollInterval = 2000; // 2 seconds

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data, error } = await apiClient.GET('/auth/mobile/attempts/{id}', {
        params: { path: { id: attemptId } },
      });

      if (error || !data) {
        console.error('[OAuth] Poll error:', error);
        continue; // Retry
      }

      const { status, access_token, refresh_token, expires_in, error: attemptError, error_description } = data;

      console.log(`[OAuth] Poll ${i + 1}/${maxAttempts}: status=${status}`);

      if (status === 'succeeded') {
        return {
          success: true,
          accessToken: access_token ?? undefined,
          refreshToken: refresh_token ?? undefined,
          expiresIn: expires_in ?? undefined,
        };
      }

      if (status === 'failed') {
        return {
          success: false,
          error: attemptError ?? 'authorization_failed',
          errorDescription: error_description ?? 'Authorization failed',
        };
      }

      if (status === 'expired') {
        return {
          success: false,
          error: 'attempt_expired',
          errorDescription: 'Authorization attempt expired',
        };
      }

      // Status is still 'pending', continue polling
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('[OAuth] Poll exception:', error);
      // Continue polling on error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout
  return {
    success: false,
    error: 'polling_timeout',
    errorDescription: 'OAuth polling timed out after 60 seconds',
  };
}

/**
 * Get stored session token
 */
export async function getSessionToken(): Promise<string | null> {
  return await SecureStore.getItemAsync('session_token');
}

/**
 * Clear stored session tokens (logout)
 */
export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync('session_token');
  await SecureStore.deleteItemAsync('refresh_token');
}
