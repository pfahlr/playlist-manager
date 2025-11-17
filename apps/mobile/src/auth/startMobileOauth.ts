import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';

/**
 * Start OAuth flow for mobile app
 * This will be implemented in task 10b with PKCE
 */
export async function startMobileOauth(provider: 'spotify' | 'deezer' | 'tidal' | 'youtube') {
  // Get the redirect URL for this app (pm://auth/callback)
  const redirectUri = Linking.createURL('auth/callback');

  console.log('OAuth redirect URI:', redirectUri);
  console.log('Provider:', provider);

  // TODO: Implement full OAuth PKCE flow in task 10b
  throw new Error('OAuth not yet implemented - see task 10b');
}
