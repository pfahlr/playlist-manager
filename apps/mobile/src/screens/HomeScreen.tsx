import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { startMobileOauth } from '../auth/startMobileOauth';

interface HomeScreenProps {
  onSignInSuccess: () => void;
}

export default function HomeScreen({ onSignInSuccess }: HomeScreenProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await startMobileOauth('spotify');

      if (result.success) {
        Alert.alert(
          'Success!',
          'You are now signed in. Session token has been stored securely.',
          [{ text: 'OK', onPress: onSignInSuccess }]
        );
      } else {
        Alert.alert(
          'Authentication Failed',
          result.errorDescription || result.error || 'Unknown error occurred',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Playlist Manager</Text>
      <Text style={styles.subtitle}>Mobile App</Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={styles.loadingText}>Authenticating...</Text>
          <Text style={styles.loadingSubtext}>
            Complete authorization in your browser, then we'll poll for the result
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.button}
          onPress={handleSignIn}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Sign in with Spotify</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.info}>
        Deep link support: pm://auth/callback
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    maxWidth: 280,
  },
  info: {
    fontSize: 12,
    color: '#999',
    marginTop: 20,
  },
});
