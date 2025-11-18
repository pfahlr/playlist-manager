import { z } from 'zod';

/**
 * Environment configuration schema with validation
 * All critical configuration must be validated here to ensure app refuses to boot with invalid config
 */
const EnvSchema = z.object({
  // ========== Core Application ==========
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3101),
  API_BASE_URL: z.string().url().default('http://localhost:3101'),

  // ========== Database ==========
  DATABASE_URL: z.string({
    required_error: 'DATABASE_URL env var is required',
  }).url(),

  // ========== Security & Encryption ==========
  MASTER_KEY: z.string({
    required_error: 'MASTER_KEY env var is required for token encryption',
  }).min(32, 'MASTER_KEY must be at least 32 characters (base64 encoded 32 bytes)'),

  MASTER_KEY_PREVIOUS: z.string().min(32).optional(),

  JWT_SECRET: z.string({
    required_error: 'JWT_SECRET env var is required for session tokens',
  }).min(32, 'JWT_SECRET must be at least 32 characters for security'),

  JWT_EXPIRES_IN: z.string().default('7d'), // e.g., '7d', '24h', '3600s'

  // ========== OAuth Providers - Spotify ==========
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),

  // ========== OAuth Providers - Deezer ==========
  DEEZER_APP_ID: z.string().optional(),
  DEEZER_SECRET_KEY: z.string().optional(),
  DEEZER_REDIRECT_URI: z.string().url().optional(),

  // ========== OAuth Providers - Tidal ==========
  TIDAL_CLIENT_ID: z.string().optional(),
  TIDAL_CLIENT_SECRET: z.string().optional(),
  TIDAL_REDIRECT_URI: z.string().url().optional(),

  // ========== OAuth Providers - YouTube ==========
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().url().optional(),

  // ========== CORS & Web Client ==========
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:19006'),
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),

  // ========== Redis & Caching ==========
  REDIS_URL: z.string().url().optional(),
  IDEMPOTENCY_STORE_BACKEND: z.enum(['redis', 'memory']).default('redis'),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),

  // ========== Storage & Backups ==========
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(), // For MinIO local development
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // ========== External APIs ==========
  MUSICBRAINZ_USER_AGENT: z.string().default('playlist-manager/1.0.0 (https://github.com/example/playlist-manager)'),

  // ========== Feature Flags ==========
  ENABLE_SPOTIFY: z.coerce.boolean().default(false),
  ENABLE_DEEZER: z.coerce.boolean().default(false),
  ENABLE_TIDAL: z.coerce.boolean().default(false),
  ENABLE_YOUTUBE: z.coerce.boolean().default(false),

  // ========== Observability ==========
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  ENABLE_METRICS: z.coerce.boolean().default(true),

  // ========== Development/Testing ==========
  API_FAKE_ENQUEUE: z.coerce.boolean().default(false),
})
.refine(
  (data) => {
    // If Spotify is enabled, require credentials
    if (data.ENABLE_SPOTIFY) {
      return !!(data.SPOTIFY_CLIENT_ID && data.SPOTIFY_CLIENT_SECRET && data.SPOTIFY_REDIRECT_URI);
    }
    return true;
  },
  {
    message: 'SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI are required when ENABLE_SPOTIFY=true',
  }
)
.refine(
  (data) => {
    // If Deezer is enabled, require credentials
    if (data.ENABLE_DEEZER) {
      return !!(data.DEEZER_APP_ID && data.DEEZER_SECRET_KEY && data.DEEZER_REDIRECT_URI);
    }
    return true;
  },
  {
    message: 'DEEZER_APP_ID, DEEZER_SECRET_KEY, and DEEZER_REDIRECT_URI are required when ENABLE_DEEZER=true',
  }
)
.refine(
  (data) => {
    // If Tidal is enabled, require credentials
    if (data.ENABLE_TIDAL) {
      return !!(data.TIDAL_CLIENT_ID && data.TIDAL_CLIENT_SECRET && data.TIDAL_REDIRECT_URI);
    }
    return true;
  },
  {
    message: 'TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET, and TIDAL_REDIRECT_URI are required when ENABLE_TIDAL=true',
  }
)
.refine(
  (data) => {
    // If YouTube is enabled, require credentials
    if (data.ENABLE_YOUTUBE) {
      return !!(data.YOUTUBE_CLIENT_ID && data.YOUTUBE_CLIENT_SECRET && data.YOUTUBE_REDIRECT_URI);
    }
    return true;
  },
  {
    message: 'YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI are required when ENABLE_YOUTUBE=true',
  }
)
.refine(
  (data) => {
    // If Redis backend is selected, require REDIS_URL
    if (data.IDEMPOTENCY_STORE_BACKEND === 'redis') {
      return !!data.REDIS_URL;
    }
    return true;
  },
  {
    message: 'REDIS_URL is required when IDEMPOTENCY_STORE_BACKEND=redis',
  }
);

type Env = z.infer<typeof EnvSchema>;
let envCache: Env | null = null;

/**
 * Load and validate environment variables
 * Throws ZodError with detailed messages if validation fails
 */
function loadEnv(): Env {
  if (!envCache) {
    try {
      envCache = EnvSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Environment validation failed:');
        if (error.errors && Array.isArray(error.errors)) {
          error.errors.forEach((err) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
          });
        }
        console.error('\n💡 Check .env.example for required variables');
        process.exit(1);
      }
      throw error;
    }
  }
  return envCache;
}

/**
 * Validated environment configuration
 * Access via env.VARIABLE_NAME - will throw on app boot if invalid
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
});

/**
 * Parse CORS origins from comma-separated string
 */
export function getCorsOrigins(): string[] {
  return env.CORS_ORIGINS.split(',').map(origin => origin.trim());
}

/**
 * Check if a specific provider is enabled
 */
export function isProviderEnabled(provider: 'spotify' | 'deezer' | 'tidal' | 'youtube'): boolean {
  switch (provider) {
    case 'spotify': return env.ENABLE_SPOTIFY;
    case 'deezer': return env.ENABLE_DEEZER;
    case 'tidal': return env.ENABLE_TIDAL;
    case 'youtube': return env.ENABLE_YOUTUBE;
  }
}

/**
 * Get list of enabled providers
 */
export function getEnabledProviders(): Array<'spotify' | 'deezer' | 'tidal' | 'youtube'> {
  const providers: Array<'spotify' | 'deezer' | 'tidal' | 'youtube'> = [];
  if (env.ENABLE_SPOTIFY) providers.push('spotify');
  if (env.ENABLE_DEEZER) providers.push('deezer');
  if (env.ENABLE_TIDAL) providers.push('tidal');
  if (env.ENABLE_YOUTUBE) providers.push('youtube');
  return providers;
}
