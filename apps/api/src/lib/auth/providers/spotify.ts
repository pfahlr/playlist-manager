import { env } from '../../../config/env';

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyUserProfile {
  id: string;
  email: string;
  display_name: string | null;
}

/**
 * Build Spotify authorization URL with PKCE
 */
export function buildSpotifyAuthUrl(params: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
}): string {
  const authUrl = new URL('https://accounts.spotify.com/authorize');

  authUrl.searchParams.set('client_id', env.SPOTIFY_CLIENT_ID!);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', params.redirectUri);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', params.codeChallenge);
  authUrl.searchParams.set('state', params.state);
  authUrl.searchParams.set('scope', [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
  ].join(' '));

  return authUrl.toString();
}

/**
 * Exchange authorization code for access token (PKCE flow)
 */
export async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<SpotifyTokenResponse> {
  const tokenUrl = 'https://accounts.spotify.com/api/token';

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: env.SPOTIFY_CLIENT_ID!,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify token exchange failed: ${response.status} ${error}`);
  }

  const data = await response.json() as SpotifyTokenResponse;
  return data;
}

/**
 * Fetch Spotify user profile
 */
export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify profile fetch failed: ${response.status} ${error}`);
  }

  const data = await response.json() as SpotifyUserProfile;
  return data;
}

/**
 * Refresh Spotify access token
 */
export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const tokenUrl = 'https://accounts.spotify.com/api/token';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.SPOTIFY_CLIENT_ID!,
    client_secret: env.SPOTIFY_CLIENT_SECRET!,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify token refresh failed: ${response.status} ${error}`);
  }

  const data = await response.json() as SpotifyTokenResponse;
  return data;
}
