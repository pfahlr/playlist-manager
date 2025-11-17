/**
 * Test utilities module
 *
 * Provides helper functions for setting up test data, mocking,
 * and cleaning up after tests.
 */

import { prisma } from '@app/db';
import type { AppUser, Playlist, Recording, Artist } from '@prisma/client';

/**
 * Test context for cleanup tracking
 */
interface TestContext {
  users: number[];
  playlists: number[];
  recordings: number[];
  artists: number[];
}

const testContext: TestContext = {
  users: [],
  playlists: [],
  recordings: [],
  artists: [],
};

/**
 * Create a test user with automatic cleanup tracking
 *
 * @param data - Optional user data overrides
 * @returns Created user
 */
export async function createTestUser(data?: Partial<AppUser>): Promise<AppUser> {
  const user = await prisma.appUser.create({
    data: {
      email: data?.email || `test-${Date.now()}@example.com`,
      display_name: data?.display_name || 'Test User',
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    },
  });

  testContext.users.push(user.id);
  return user;
}

/**
 * Create a test playlist with optional items
 *
 * @param userId - Owner user ID
 * @param data - Optional playlist data and items
 * @returns Created playlist with items
 */
export async function createTestPlaylist(
  userId: number,
  data?: {
    name?: string;
    itemCount?: number;
  }
): Promise<Playlist> {
  const playlist = await prisma.playlist.create({
    data: {
      user_id: userId,
      name: data?.name || `Test Playlist ${Date.now()}`,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  testContext.playlists.push(playlist.id);

  // Optionally create items
  if (data?.itemCount && data.itemCount > 0) {
    for (let i = 0; i < data.itemCount; i++) {
      // Create artist and recording for each item
      const artist = await createTestArtist();
      const recording = await createTestRecording(artist.id);

      await prisma.playlistItem.create({
        data: {
          playlist_id: playlist.id,
          recording_id: recording.id,
          position: i,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }

  return playlist;
}

/**
 * Create a test artist
 *
 * @param data - Optional artist data
 * @returns Created artist
 */
export async function createTestArtist(data?: Partial<Artist>): Promise<Artist> {
  const artist = await prisma.artist.create({
    data: {
      name: data?.name || `Test Artist ${Date.now()}`,
      mbid: data?.mbid,
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    },
  });

  testContext.artists.push(artist.id);
  return artist;
}

/**
 * Create a test recording
 *
 * @param artistId - Artist ID for the recording
 * @param data - Optional recording data
 * @returns Created recording
 */
export async function createTestRecording(
  artistId: number,
  data?: Partial<Recording>
): Promise<Recording> {
  const recording = await prisma.recording.create({
    data: {
      title: data?.title || `Test Recording ${Date.now()}`,
      duration_ms: data?.duration_ms || 180000,
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    },
  });

  testContext.recordings.push(recording.id);

  // Link to artist
  await prisma.recordingArtist.create({
    data: {
      recording_id: recording.id,
      artist_id: artistId,
      position: 0,
    },
  });

  return recording;
}

/**
 * Mock provider OAuth tokens for a user
 *
 * @param userId - User ID
 * @param provider - Provider name
 * @param tokens - Token data
 * @returns Created account
 */
export async function mockProviderAuth(
  userId: number,
  provider: string,
  tokens: {
    access_token_ciphertext: Buffer;
    refresh_token_ciphertext?: Buffer | null;
  }
) {
  const account = await prisma.account.create({
    data: {
      user_id: userId,
      provider,
      provider_account_id: `mock-${Date.now()}`,
      access_token_ciphertext: tokens.access_token_ciphertext,
      refresh_token_ciphertext: tokens.refresh_token_ciphertext || null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  return account;
}

/**
 * Clean up all test data created during the test run
 *
 * Deletes in dependency order to avoid foreign key violations.
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in reverse dependency order
  if (testContext.playlists.length > 0) {
    await prisma.playlistItem.deleteMany({
      where: { playlist_id: { in: testContext.playlists } },
    });
    await prisma.playlist.deleteMany({
      where: { id: { in: testContext.playlists } },
    });
  }

  if (testContext.recordings.length > 0) {
    await prisma.recordingArtist.deleteMany({
      where: { recording_id: { in: testContext.recordings } },
    });
    await prisma.recording.deleteMany({
      where: { id: { in: testContext.recordings } },
    });
  }

  if (testContext.artists.length > 0) {
    await prisma.artist.deleteMany({
      where: { id: { in: testContext.artists } },
    });
  }

  if (testContext.users.length > 0) {
    await prisma.account.deleteMany({
      where: { user_id: { in: testContext.users } },
    });
    await prisma.appUser.deleteMany({
      where: { id: { in: testContext.users } },
    });
  }

  // Reset tracking
  testContext.users = [];
  testContext.playlists = [];
  testContext.recordings = [];
  testContext.artists = [];
}

/**
 * Seed deterministic test fixtures
 *
 * Creates a known set of test data for integration tests.
 *
 * @returns Seeded data IDs
 */
export async function seedTestDatabase(): Promise<{
  userId: number;
  playlistId: number;
  artistId: number;
  recordingId: number;
}> {
  const user = await createTestUser({
    email: 'fixture@example.com',
    display_name: 'Fixture User',
  });

  const artist = await createTestArtist({
    name: 'Fixture Artist',
  });

  const recording = await createTestRecording(artist.id, {
    title: 'Fixture Recording',
    duration_ms: 200000,
  });

  const playlist = await createTestPlaylist(user.id, {
    name: 'Fixture Playlist',
  });

  // Add recording to playlist
  await prisma.playlistItem.create({
    data: {
      playlist_id: playlist.id,
      recording_id: recording.id,
      position: 0,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  return {
    userId: user.id,
    playlistId: playlist.id,
    artistId: artist.id,
    recordingId: recording.id,
  };
}
