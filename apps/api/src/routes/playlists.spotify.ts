import { FastifyPluginAsync } from 'fastify';
import { SpotifyClient } from '@app/providers-spotify';
import { getValidProviderToken } from '../lib/auth/tokens';

interface SpotifyPlaylistsResponse {
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    tracks: {
      total: number;
    };
  }>;
}

/**
 * Spotify playlist integration endpoints
 * GET /playlists/spotify - List user's Spotify playlists
 */
const spotifyPlaylistsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /playlists/spotify
   * Get user's Spotify playlists using their linked account
   * Requires authentication
   * Automatically refreshes tokens if expired
   */
  fastify.get('/playlists/spotify', {
    preHandler: fastify.authenticate,
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            playlists: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: ['string', 'null'] },
                  track_count: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;

      try {
        // Get valid access token (automatically refreshes if expired)
        const accessToken = await getValidProviderToken(userId, 'spotify');

        // Create Spotify client
        const spotify = new SpotifyClient({ token: accessToken });

        // Fetch user's playlists
        // Note: Spotify's /me/playlists endpoint returns user's playlists
        // For full implementation, we'd need to paginate through all playlists
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as SpotifyPlaylistsResponse;

        return reply.status(200).send({
          playlists: data.items.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            track_count: playlist.tracks.total,
          })),
        });
      } catch (error) {
        fastify.log.error({ err: error, userId }, 'Failed to fetch Spotify playlists');

        if (error instanceof Error) {
          if (error.message.includes('No spotify account linked')) {
            return reply.status(404).send({
              type: 'about:blank',
              code: 'spotify_not_linked',
              message: 'No Spotify account linked. Please connect your Spotify account first.',
              details: { request_id: request.id },
            });
          }

          if (error.message.includes('token expired')) {
            return reply.status(401).send({
              type: 'about:blank',
              code: 'token_refresh_failed',
              message: 'Failed to refresh Spotify token. Please reconnect your account.',
              details: { request_id: request.id },
            });
          }
        }

        return reply.status(500).send({
          type: 'about:blank',
          code: 'internal_error',
          message: 'Failed to fetch Spotify playlists',
          details: { request_id: request.id },
        });
      }
    },
  });
};

export default spotifyPlaylistsRoutes;
