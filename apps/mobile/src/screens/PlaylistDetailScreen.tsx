/**
 * Playlist Detail Screen - Task 10c
 * Shows playlist items and export functionality
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { usePlaylistItems, useExportPlaylist, useJobStatus } from '../hooks/usePlaylists';

interface PlaylistDetailScreenProps {
  playlistId: string;
  playlistName: string;
  onBack: () => void;
}

export default function PlaylistDetailScreen({
  playlistId,
  playlistName,
  onBack,
}: PlaylistDetailScreenProps) {
  const { data: items, isLoading, error, refetch, isRefetching } = usePlaylistItems(playlistId);
  const exportMutation = useExportPlaylist();
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const { data: jobStatus } = useJobStatus(exportJobId);

  const handleExport = async (format: 'm3u' | 'csv' | 'xspf') => {
    try {
      const result = await exportMutation.mutateAsync({
        playlistId,
        format,
      });

      if (result?.job_id) {
        setExportJobId(result.job_id);
        Alert.alert(
          'Export Started',
          `Your playlist is being exported to ${format.toUpperCase()}. Job ID: ${result.job_id}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Export Failed',
        error instanceof Error ? error.message : 'Unknown error occurred',
        [{ text: 'OK' }]
      );
    }
  };

  // Show export status if job is active
  React.useEffect(() => {
    if (jobStatus && exportJobId) {
      if (jobStatus.status === 'succeeded') {
        Alert.alert(
          'Export Complete!',
          `Your playlist has been exported successfully.${
            jobStatus.artifact_url ? `\n\nDownload: ${jobStatus.artifact_url}` : ''
          }`,
          [
            {
              text: 'OK',
              onPress: () => setExportJobId(null),
            },
          ]
        );
      } else if (jobStatus.status === 'failed') {
        Alert.alert(
          'Export Failed',
          'The export job failed. Please try again.',
          [
            {
              text: 'OK',
              onPress: () => setExportJobId(null),
            },
          ]
        );
      }
    }
  }, [jobStatus, exportJobId]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
        <Text style={styles.loadingText}>Loading tracks...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load tracks</Text>
        <Text style={styles.errorDetails}>{error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to Playlists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonHeader}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {playlistName}
          </Text>
          <Text style={styles.headerSubtitle}>{items?.length || 0} tracks</Text>
        </View>
      </View>

      {/* Export Buttons */}
      <View style={styles.exportContainer}>
        <Text style={styles.exportLabel}>Export Playlist:</Text>
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={[styles.exportButton, exportMutation.isPending && styles.exportButtonDisabled]}
            onPress={() => handleExport('csv')}
            disabled={exportMutation.isPending}
          >
            <Text style={styles.exportButtonText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, exportMutation.isPending && styles.exportButtonDisabled]}
            onPress={() => handleExport('m3u')}
            disabled={exportMutation.isPending}
          >
            <Text style={styles.exportButtonText}>M3U</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, exportMutation.isPending && styles.exportButtonDisabled]}
            onPress={() => handleExport('xspf')}
            disabled={exportMutation.isPending}
          >
            <Text style={styles.exportButtonText}>XSPF</Text>
          </TouchableOpacity>
        </View>
        {exportMutation.isPending && (
          <ActivityIndicator size="small" color="#1DB954" style={styles.exportLoading} />
        )}
        {jobStatus && exportJobId && (
          <Text style={styles.jobStatus}>
            Export status: {jobStatus.status}
            {jobStatus.status === 'running' && '...'}
          </Text>
        )}
      </View>

      {/* Track List */}
      {!items || items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tracks in this playlist</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.position}-${index}`}
          renderItem={({ item, index }) => (
            <View style={styles.trackCard}>
              <Text style={styles.trackPosition}>{(item.position ?? index) + 1}</Text>
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {item.title || item.snapshot_title || 'Unknown Track'}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.artists || item.snapshot_artists || 'Unknown Artist'}
                </Text>
                {item.album && (
                  <Text style={styles.trackAlbum} numberOfLines={1}>
                    {item.album}
                  </Text>
                )}
              </View>
              {item.duration_ms && (
                <Text style={styles.trackDuration}>
                  {Math.floor(item.duration_ms / 60000)}:
                  {String(Math.floor((item.duration_ms % 60000) / 1000)).padStart(2, '0')}
                </Text>
              )}
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#1DB954" />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60, // Account for status bar
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButtonHeader: {
    padding: 8,
    marginRight: 8,
  },
  backChevron: {
    fontSize: 36,
    color: '#1DB954',
    fontWeight: '300',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  exportContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  exportLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#1DB954',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  exportLoading: {
    marginTop: 12,
  },
  jobStatus: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  trackCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackPosition: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    width: 32,
    textAlign: 'right',
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  trackArtist: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  trackAlbum: {
    fontSize: 12,
    color: '#999',
  },
  trackDuration: {
    fontSize: 14,
    color: '#999',
    marginLeft: 12,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e53935',
    marginBottom: 8,
  },
  errorDetails: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
