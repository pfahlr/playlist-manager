# Development Setup Guide

## Prerequisites

### Required Software

| Tool | Minimum Version | Installation |
|------|----------------|--------------|
| **Node.js** | 18.18+ | https://nodejs.org |
| **pnpm** | 9.12.3 | `npm install -g pnpm@9.12.3` |
| **Docker** | 20.10+ | https://docs.docker.com/get-docker/ |
| **Docker Compose** | 2.0+ | Included with Docker Desktop |
| **PostgreSQL Client** | 16 | `brew install postgresql@16` (macOS) |
| **Git** | 2.30+ | https://git-scm.com |

### Optional Tools

- **Expo CLI**: `npm install -g expo-cli` (for mobile development)
- **Redis CLI**: `brew install redis` (for debugging)
- **AWS CLI**: `brew install awscli` (for S3 operations)
- **MinIO Client**: `brew install minio/stable/mc` (for MinIO management)

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/pfahlr/playlist-manager.git
cd playlist-manager

# 2. Install dependencies
pnpm install

# 3. Copy environment template
cp apps/api/.env.example apps/api/.env

# 4. Start infrastructure services
docker-compose up -d

# 5. Wait for PostgreSQL to be ready
pnpm db:health

# 6. Run database migrations
pnpm prisma:migrate:deploy

# 7. (Optional) Seed database with test data
pnpm prisma:seed

# 8. Generate Prisma client
pnpm prisma:generate

# 9. Generate API types
pnpm gen:types

# 10. Start API server
pnpm api:dev

# API is now running at http://localhost:3101
# Docs available at http://localhost:3101/docs
```

---

## Environment Configuration

### API Environment Variables

Create `apps/api/.env` from the template:

```bash
# =============================================================================
# REQUIRED - Application will not start without these
# =============================================================================

# Database connection string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public

# Master encryption key for provider tokens (32 bytes, base64-encoded)
# Generate with: openssl rand -base64 32
MASTER_KEY=<generate-with-openssl-rand>

# JWT secret for session tokens (min 32 characters)
# Generate with: openssl rand -base64 32
JWT_SECRET=<generate-with-openssl-rand>

# =============================================================================
# OPTIONAL - Defaults are provided
# =============================================================================

# Application environment
NODE_ENV=development

# API server port
PORT=3101

# API base URL (for OAuth redirects)
API_BASE_URL=http://localhost:3101

# JWT token expiration
JWT_EXPIRES_IN=7d

# Redis (for caching, rate limiting, job queues)
REDIS_URL=redis://localhost:6379

# CORS allowed origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://localhost:19006

# Idempotency store backend
IDEMPOTENCY_STORE_BACKEND=redis
IDEMPOTENCY_TTL_SECONDS=900

# =============================================================================
# SPOTIFY OAUTH (if testing Spotify integration)
# =============================================================================

# Get credentials from: https://developer.spotify.com/dashboard
ENABLE_SPOTIFY=true
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3101/api/v1/auth/callback/spotify

# =============================================================================
# S3/MINIO (for file export testing)
# =============================================================================

# MinIO (local development)
S3_BUCKET=playlist-exports
S3_ENDPOINT=http://localhost:9000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio12345

# =============================================================================
# OBSERVABILITY
# =============================================================================

LOG_LEVEL=info
ENABLE_METRICS=true
```

### Mobile Environment Variables

Create `apps/mobile/.env`:

```bash
# API endpoint
EXPO_PUBLIC_API_URL=http://localhost:3101

# For testing on physical device, use your machine's IP:
# EXPO_PUBLIC_API_URL=http://192.168.1.100:3101
```

---

## Project Structure

```
playlist-manager/
│
├── apps/
│   ├── api/              # Backend API (Fastify)
│   │   ├── src/
│   │   │   ├── routes/       # HTTP route handlers
│   │   │   ├── plugins/      # Fastify plugins (auth, cors, etc.)
│   │   │   ├── lib/          # Business logic
│   │   │   ├── config/       # Configuration (env validation)
│   │   │   └── dev/          # Development server
│   │   ├── test/             # Integration tests
│   │   └── public/           # Static files (OpenAPI, docs)
│   │
│   ├── mobile/           # Mobile app (Expo/React Native)
│   │   ├── src/
│   │   │   ├── screens/      # Screen components
│   │   │   ├── auth/         # OAuth integration
│   │   │   ├── lib/          # Utilities (PKCE, etc.)
│   │   │   └── api.ts        # Type-safe API client
│   │   ├── app.config.ts     # Expo configuration
│   │   └── App.tsx           # Root component
│   │
│   └── worker/           # Background job processor
│       └── src/
│           └── processors/   # Job handlers
│
├── packages/
│   ├── contracts/        # OpenAPI types & shared contracts
│   │   └── src/
│   │       └── api.types.ts  # Generated from openapi.yaml
│   │
│   ├── db/               # Prisma schema & database client
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Database schema
│   │   │   ├── migrations/   # Migration history
│   │   │   └── seed.ts       # Test data seeder
│   │   └── src/
│   │       └── encryption/   # Token encryption utilities
│   │
│   ├── interop/          # File format parsers
│   │   └── src/importers/
│   │       ├── csv.ts        # CSV parser
│   │       ├── m3u.ts        # M3U/M3U8 parser
│   │       └── xspf.ts       # XSPF parser
│   │
│   └── providers/        # Music service integrations
│       ├── core/         # Shared provider utilities
│       ├── spotify/      # Spotify API client
│       ├── deezer/       # Deezer API client [partial]
│       └── file-exporters/   # Export to M3U/CSV/XSPF
│
├── scripts/              # Operational scripts
│   ├── backup.sh         # Database backup with S3 sync
│   ├── restore.sh        # Restore from backup
│   └── rotate-token-key.ts # Rotate encryption keys
│
├── docs/                 # Documentation
├── openapi.yaml          # API specification
├── docker-compose.yml    # Local infrastructure
├── package.json          # Root package.json (workspace config)
├── pnpm-workspace.yaml   # pnpm workspace configuration
├── tsconfig.json         # TypeScript configuration
└── vitest.config.ts      # Test configuration
```

---

## Development Workflow

### 1. Starting Services

```bash
# Start all infrastructure services
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

**Services Started**:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (ports 9000, 9001)

### 2. Database Operations

```bash
# Apply pending migrations (development)
pnpm prisma:migrate:dev

# Apply pending migrations (production)
pnpm prisma:migrate:deploy

# Create a new migration
pnpm prisma:migrate:dev --name add_new_feature

# Reset database (WARNING: deletes all data)
pnpm prisma:migrate:reset

# Open Prisma Studio (GUI for database)
pnpm prisma:studio

# Check database health
pnpm db:health

# Seed database with test data
pnpm prisma:seed
```

### 3. Code Generation

```bash
# Generate Prisma client (after schema changes)
pnpm prisma:generate

# Generate TypeScript types from OpenAPI spec
pnpm gen:types

# Verify generated types are up-to-date (CI check)
pnpm check:gen
```

### 4. Running API

```bash
# Development mode (hot reload with tsx)
pnpm api:dev

# Test mode (fake job queue)
API_FAKE_ENQUEUE=1 pnpm api:dev

# API available at http://localhost:3101
# OpenAPI docs at http://localhost:3101/docs
# OpenAPI spec at http://localhost:3101/openapi.yaml
# Metrics at http://localhost:3101/metrics
```

### 5. Running Mobile App

```bash
# Install dependencies (if not done)
pnpm install

# Start Metro bundler
cd apps/mobile
pnpm start

# In separate terminal, run on iOS simulator
pnpm ios

# Or run on Android emulator
pnpm android

# Or scan QR code with Expo Go app on physical device
```

**Testing on Physical Device**:
1. Ensure device is on same network as development machine
2. Update `apps/mobile/.env`:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.100:3101
   ```
3. Restart Metro: `pnpm start --clear`

### 6. Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run specific test file
pnpm test path/to/test.test.ts

# Run API contract tests (Dredd)
pnpm test:contract:dredd:server

# Run property-based contract tests (Schemathesis)
pnpm test:contract:st:server
```

---

## Common Development Tasks

### Adding a New API Endpoint

1. **Update OpenAPI Spec** (`openapi.yaml`):
```yaml
paths:
  /playlists/{id}/tracks:
    get:
      summary: Get playlist tracks
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  tracks:
                    type: array
                    items:
                      $ref: '#/components/schemas/Track'
```

2. **Generate TypeScript Types**:
```bash
pnpm gen:types
```

3. **Create Route Handler** (`apps/api/src/routes/playlists/[id]/tracks.get.ts`):
```typescript
import { FastifyPluginAsync } from 'fastify';

const getPlaylistTracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/playlists/:id/tracks', {
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const tracks = await prisma.playlistItem.findMany({
        where: { playlist_id: parseInt(id) },
        include: { recording: true },
      });

      return reply.send({ tracks });
    },
  });
};

export default getPlaylistTracksRoute;
```

4. **Register Route** (`apps/api/src/routes/register-handlers.ts`):
```typescript
import getPlaylistTracks from './playlists/[id]/tracks.get.js';

// ...
await app.register(getPlaylistTracks);
```

5. **Test the Endpoint**:
```bash
# Start API
pnpm api:dev

# Test with curl
curl http://localhost:3101/api/v1/playlists/1/tracks \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Adding a Database Model

1. **Update Prisma Schema** (`packages/db/prisma/schema.prisma`):
```prisma
model PlaylistTag {
  id          Int      @id @default(autoincrement())
  playlist_id Int
  tag         String
  created_at  DateTime @default(now()) @db.Timestamptz

  playlist Playlist @relation(fields: [playlist_id], references: [id], onDelete: Cascade)

  @@unique([playlist_id, tag])
  @@index([tag])
  @@map("playlist_tag")
}

model Playlist {
  // ... existing fields
  tags PlaylistTag[]
}
```

2. **Create Migration**:
```bash
pnpm prisma:migrate:dev --name add_playlist_tags
```

3. **Generate Prisma Client**:
```bash
pnpm prisma:generate
```

4. **Use in Code**:
```typescript
import { prisma } from '@app/db';

// Create playlist with tags
const playlist = await prisma.playlist.create({
  data: {
    name: 'My Playlist',
    user_id: 123,
    tags: {
      create: [
        { tag: 'rock' },
        { tag: 'favorites' },
      ],
    },
  },
  include: { tags: true },
});

// Query playlists by tag
const rockPlaylists = await prisma.playlist.findMany({
  where: {
    tags: {
      some: { tag: 'rock' },
    },
  },
});
```

### Adding Mobile Screens

1. **Create Screen Component** (`apps/mobile/src/screens/PlaylistsScreen.tsx`):
```tsx
import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api';

export default function PlaylistsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['playlists', 'spotify'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/playlists/spotify');
      return data;
    },
  });

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  return (
    <View>
      <FlatList
        data={data?.playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Text>{item.name} ({item.track_count} tracks)</Text>
        )}
      />
    </View>
  );
}
```

2. **Add Navigation** (if using React Navigation):
```tsx
import PlaylistsScreen from './screens/PlaylistsScreen';

const Stack = createNativeStackNavigator();

<Stack.Navigator>
  <Stack.Screen name="Home" component={HomeScreen} />
  <Stack.Screen name="Playlists" component={PlaylistsScreen} />
</Stack.Navigator>
```

### Debugging

#### API Debugging

**Enable Debug Logs**:
```bash
LOG_LEVEL=debug pnpm api:dev
```

**Inspect Database Queries**:
```bash
# In .env
DATABASE_URL=postgresql://...?connect_timeout=10&sslmode=disable&log=trace
```

**Use Prisma Studio**:
```bash
pnpm prisma:studio
# Opens at http://localhost:5555
```

**View Redis Data**:
```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# List all keys
redis> KEYS *

# Get value
redis> GET idempotency:key123

# Monitor live commands
redis> MONITOR
```

#### Mobile Debugging

**Enable Remote Debugging**:
1. Shake device (or Cmd+D on iOS simulator)
2. Select "Debug Remote JS"
3. Chrome DevTools opens at http://localhost:19000/debugger-ui

**View Logs**:
```bash
# iOS
npx react-native log-ios

# Android
npx react-native log-android
```

**Inspect Network Requests**:
- Install React Native Debugger
- Or use Flipper: https://fbflipper.com

---

## Troubleshooting

### Problem: `pnpm install` fails

**Solution**:
```bash
# Clear pnpm cache
pnpm store prune

# Delete node_modules and lock file
rm -rf node_modules pnpm-lock.yaml

# Reinstall
pnpm install
```

### Problem: Database migration fails

**Solution**:
```bash
# Check if PostgreSQL is running
docker-compose ps db

# View database logs
docker-compose logs db

# Reset database (WARNING: deletes data)
pnpm prisma:migrate:reset
```

### Problem: API won't start (port already in use)

**Solution**:
```bash
# Find process using port 3101
lsof -i :3101

# Kill process
kill -9 <PID>

# Or use different port
PORT=3102 pnpm api:dev
```

### Problem: Mobile app can't connect to API

**Checklist**:
- [ ] API is running (`pnpm api:dev`)
- [ ] Correct API URL in `apps/mobile/.env`
- [ ] For physical device, use machine IP not `localhost`
- [ ] CORS is configured to allow mobile origin
- [ ] Firewall allows incoming connections

**Test API connectivity**:
```bash
# From mobile device/simulator
curl http://localhost:3101/health
# or
curl http://192.168.1.100:3101/health
```

### Problem: Expo build fails

**Solution**:
```bash
# Clear cache
cd apps/mobile
expo start --clear

# Reset Metro bundler
rm -rf node_modules/.cache

# Rebuild
pnpm install
pnpm start
```

### Problem: TypeScript errors after pulling changes

**Solution**:
```bash
# Regenerate types
pnpm gen:types
pnpm prisma:generate

# Restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"
```

---

## Code Quality Tools

### Linting

```bash
# Lint API code
cd apps/api
pnpm lint

# Lint with auto-fix
pnpm lint --fix
```

### Formatting

```bash
# Format code with Prettier
pnpm format

# Check formatting
pnpm format:check
```

### Type Checking

```bash
# Check TypeScript types
pnpm typecheck

# Watch mode
pnpm typecheck --watch
```

### OpenAPI Validation

```bash
# Lint OpenAPI spec
pnpm lint:api

# Check for breaking changes
pnpm check:breaking
```

---

## Performance Optimization

### Database Query Optimization

**Use `EXPLAIN ANALYZE`**:
```bash
# Run explain checks
./scripts/run-explain-checks.sh

# Individual query
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM playlist WHERE user_id = 123;"
```

**Add Indexes**:
```prisma
model Playlist {
  @@index([user_id])              # Single column
  @@index([user_id, created_at])  # Composite index
}
```

### API Performance

**Enable Request Logging**:
```typescript
// apps/api/src/dev/start.ts
import logging from './plugins/logging.js';

await app.register(logging, {
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        headers: request.headers,
        queryString: request.query,
      };
    },
    res(response) {
      return {
        statusCode: response.statusCode,
        responseTime: response.getResponseTime(),
      };
    },
  },
});
```

**Monitor Slow Queries**:
```bash
# In PostgreSQL config
log_min_duration_statement = 1000  # Log queries > 1s
```

### Mobile Performance

**Use React DevTools Profiler**:
```tsx
import { Profiler } from 'react';

<Profiler id="PlaylistScreen" onRender={handleRender}>
  <PlaylistScreen />
</Profiler>
```

**Optimize Re-renders**:
```tsx
import { memo } from 'react';

const PlaylistItem = memo(({ playlist }) => {
  return <Text>{playlist.name}</Text>;
});
```

---

## Production Considerations

### Build for Production

```bash
# Build API
cd apps/api
pnpm build

# Build mobile (iOS)
cd apps/mobile
eas build --platform ios

# Build mobile (Android)
eas build --platform android
```

### Environment Variables

**Production Checklist**:
- [ ] `NODE_ENV=production`
- [ ] Strong `MASTER_KEY` and `JWT_SECRET`
- [ ] HTTPS only (`API_BASE_URL=https://api.example.com`)
- [ ] Real database URL (not localhost)
- [ ] Redis cluster URL
- [ ] S3 bucket configured (not MinIO)
- [ ] CORS restricted to production domains
- [ ] Metrics and logging configured

### Database Migrations

**Apply in Production**:
```bash
# Never run migrate:dev in production!
# Always use migrate:deploy
pnpm prisma:migrate:deploy

# Verify migration history
pnpm prisma:migrate:status
```

### Monitoring

**Set up monitoring for**:
- API response times (p50, p95, p99)
- Error rates (5xx responses)
- Database connection pool utilization
- Redis memory usage
- OAuth success/failure rates
- Token refresh rates

---

## Next Steps

- **Read the [Architecture Guide](./ARCHITECTURE.md)** for system design
- **Read the [Authentication Guide](./AUTHENTICATION.md)** for security details
- **Read the [API Reference](./API.md)** for endpoint documentation
- **Read the [Database Guide](./DATABASE.md)** for schema details
- **Join the team Discord/Slack** (if applicable)
- **Review open issues** on GitHub

Happy coding! 🚀
