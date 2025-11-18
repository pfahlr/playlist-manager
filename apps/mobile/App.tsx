import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from './src/screens/HomeScreen';
import PlaylistsScreen from './src/screens/PlaylistsScreen';
import PlaylistDetailScreen from './src/screens/PlaylistDetailScreen';
import { getSessionToken, clearSession } from './src/auth/startMobileOauth';
import { setAuthToken } from './src/api';

// Create a query client for React Query
const queryClient = new QueryClient();

type Screen = 'home' | 'playlists' | 'playlist-detail';

interface PlaylistDetailParams {
  playlistId: string;
  playlistName: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [playlistDetail, setPlaylistDetail] = useState<PlaylistDetailParams | null>(null);

  // Check for existing session on app load
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const token = await getSessionToken();
      if (token) {
        // Set auth token in API client
        setAuthToken(token);
        // User is already authenticated, go to playlists
        setCurrentScreen('playlists');
      }
    } catch (error) {
      console.error('Failed to check session:', error);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleSignInSuccess = async () => {
    // Get the newly stored session token and set it in API client
    const token = await getSessionToken();
    if (token) {
      setAuthToken(token);
    }
    setCurrentScreen('playlists');
  };

  const handlePlaylistPress = (playlistId: string, playlistName: string) => {
    setPlaylistDetail({ playlistId, playlistName });
    setCurrentScreen('playlist-detail');
  };

  const handleBackToPlaylists = () => {
    setCurrentScreen('playlists');
    setPlaylistDetail(null);
  };

  const handleSignOut = async () => {
    await clearSession();
    setAuthToken(null);
    setCurrentScreen('home');
    setPlaylistDetail(null);
    // Clear React Query cache
    queryClient.clear();
  };

  if (isCheckingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaView style={styles.container}>
        {currentScreen === 'home' && <HomeScreen onSignInSuccess={handleSignInSuccess} />}
        {currentScreen === 'playlists' && (
          <PlaylistsScreen onPlaylistPress={handlePlaylistPress} onSignOut={handleSignOut} />
        )}
        {currentScreen === 'playlist-detail' && playlistDetail && (
          <PlaylistDetailScreen
            playlistId={playlistDetail.playlistId}
            playlistName={playlistDetail.playlistName}
            onBack={handleBackToPlaylists}
          />
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
