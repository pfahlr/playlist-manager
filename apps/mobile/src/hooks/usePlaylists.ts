/**
 * React Query hooks for playlist data
 * Task 10c: Mobile playlist MVP
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api';

/**
 * Hook to fetch user's Spotify playlists
 */
export function useSpotifyPlaylists() {
  return useQuery({
    queryKey: ['playlists', 'spotify'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/playlists/spotify');

      if (error) {
        throw new Error(error.message || 'Failed to fetch playlists');
      }

      return data?.playlists || [];
    },
    // Only fetch when user is authenticated
    enabled: true,
    staleTime: 60000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to fetch playlist items by ID
 */
export function usePlaylistItems(playlistId: string | null) {
  return useQuery({
    queryKey: ['playlist', playlistId, 'items'],
    queryFn: async () => {
      if (!playlistId) {
        throw new Error('Playlist ID is required');
      }

      const { data, error } = await apiClient.GET('/playlists/{id}/items', {
        params: { path: { id: playlistId } },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch playlist items');
      }

      return data?.items || [];
    },
    enabled: !!playlistId,
    staleTime: 60000,
  });
}

/**
 * Hook to export playlist to file
 */
export function useExportPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { playlistId: string; format: 'm3u' | 'csv' | 'xspf' }) => {
      const { data, error } = await apiClient.POST('/exports/file', {
        body: {
          playlist_id: params.playlistId,
          format: params.format,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to export playlist');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate jobs query if we have one
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

/**
 * Hook to check job status
 */
export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }

      const { data, error } = await apiClient.GET('/jobs/{id}', {
        params: { path: { id: jobId } },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch job status');
      }

      return data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if job is still running
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 2000 : false;
    },
    staleTime: 0, // Always fetch fresh data for job status
  });
}
