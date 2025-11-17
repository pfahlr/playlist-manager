import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { startMobileOauth } from '../auth/startMobileOauth';

export default function HomeScreen() {
  const handleSignIn = async () => {
    try {
      await startMobileOauth('spotify');
    } catch (error) {
      Alert.alert('OAuth Not Ready', 'OAuth flow will be implemented in task 10b');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Playlist Manager</Text>
      <Text style={styles.subtitle}>Mobile App</Text>

      <TouchableOpacity style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>Sign in with Spotify</Text>
      </TouchableOpacity>

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
  info: {
    fontSize: 12,
    color: '#999',
    marginTop: 20,
  },
});
