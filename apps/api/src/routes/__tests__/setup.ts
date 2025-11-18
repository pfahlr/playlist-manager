/**
 * Test setup and environment configuration
 * Loads before tests to set up required environment variables
 *
 * IMPORTANT: This runs immediately when imported (not in beforeAll)
 * so that env vars are available when other modules are loaded
 */

// Set required environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/playlist_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Auth/session secrets
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_' + Date.now();
// MASTER_KEY must be base64 encoded and decode to exactly 32 bytes
process.env.MASTER_KEY =
  process.env.MASTER_KEY || Buffer.from('test_master_key_exactly_32bytesX').toString('base64');

// API config
process.env.API_PORT = '3101';
process.env.API_HOST = '0.0.0.0';
process.env.CORS_ORIGINS = '*';

// Provider configuration (disabled by default in tests)
process.env.PROVIDERS_SPOTIFY_ENABLED = process.env.PROVIDERS_SPOTIFY_ENABLED || 'true';
process.env.PROVIDERS_SPOTIFY_CLIENT_ID = process.env.PROVIDERS_SPOTIFY_CLIENT_ID || 'test_client_id';
process.env.PROVIDERS_SPOTIFY_CLIENT_SECRET = process.env.PROVIDERS_SPOTIFY_CLIENT_SECRET || 'test_client_secret';
process.env.PROVIDERS_SPOTIFY_REDIRECT_URI = 'http://localhost:3101/auth/callback/spotify';

process.env.PROVIDERS_DEEZER_ENABLED = 'false';
process.env.PROVIDERS_TIDAL_ENABLED = 'false';
process.env.PROVIDERS_YOUTUBE_ENABLED = 'false';

// S3/Storage (optional for most tests)
process.env.S3_BUCKET = process.env.S3_BUCKET || 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
