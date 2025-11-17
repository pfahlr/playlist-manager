# Playlist Manager - System Architecture

## Overview

Playlist Manager is a **contract-first, type-safe** playlist aggregation and migration platform built as a monorepo using pnpm workspaces. The system enables users to authenticate with multiple music streaming services, aggregate playlists, and migrate them between providers.

## Core Principles

1. **Contract-First Development**: OpenAPI specification as the single source of truth
2. **End-to-End Type Safety**: Generated TypeScript types from API → Mobile → Database
3. **Security by Default**: Encryption at rest, PKCE OAuth, refresh token rotation
4. **Modular Architecture**: Clear separation of concerns via workspace packages
5. **Production-Ready**: Comprehensive testing, observability, and operational tooling

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Clients                                 │
├────────────────────┬────────────────────┬────────────────────────┤
│   Mobile App       │    Web App         │   External APIs        │
│   (Expo/RN)        │    (React/Vite)    │   (GitHub Actions)     │
│   - OAuth Flow     │    - Dashboard     │   - CI/CD              │
│   - Playlists      │    - Management    │   - Contract Tests     │
│   - Export Tracks  │    - Analytics     │                        │
└────────────────────┴────────────────────┴────────────────────────┘
                              ↓ HTTPS/WSS
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (Fastify)                         │
├─────────────────────────────────────────────────────────────────┤
│  Plugins:  Auth │ CORS │ Rate Limit │ Idempotency │ Metrics     │
│  Routes:   /playlists │ /jobs │ /auth │ /artists │ /exports     │
│  Features: OAuth │ Sessions │ Provider Integration │ File Export │
└─────────────────────────────────────────────────────────────────┘
          ↓                    ↓                    ↓
┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │     Redis      │  │   S3/MinIO          │
│   - User Data    │  │   - Cache      │  │   - Export Files    │
│   - Playlists    │  │   - Sessions   │  │   - Artifacts       │
│   - Catalog      │  │   - Job Queue  │  │                     │
└──────────────────┘  └────────────────┘  └──────────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  Background      │
                    │  Worker          │
                    │  - File Exports  │
                    │  - Enrichment    │
                    │  - Migrations    │
                    └──────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  External APIs   │
                    │  - Spotify       │
                    │  - Deezer        │
                    │  - MusicBrainz   │
                    └──────────────────┘
```

---

## Monorepo Structure

```
playlist-manager/
├── apps/
│   ├── api/          # Backend API (Fastify, Node.js)
│   ├── mobile/       # Mobile app (Expo, React Native)
│   ├── web/          # Web app (Vite, React) [stub]
│   └── worker/       # Background job processor
│
├── packages/
│   ├── contracts/    # OpenAPI types & shared contracts
│   ├── db/           # Prisma schema & database client
│   ├── interop/      # File format parsers (M3U, CSV, XSPF, etc.)
│   └── providers/    # Music service integrations
│       ├── core/          # Shared provider utilities
│       ├── spotify/       # Spotify API client
│       ├── deezer/        # Deezer API client [partial]
│       ├── tidal/         # Tidal API client [partial]
│       ├── youtube/       # YouTube Music client [partial]
│       └── file-exporters/ # Export to M3U/CSV/XSPF
│
├── scripts/          # Operational scripts (backup, rotate-keys)
├── docs/             # Documentation
└── openapi.yaml      # API contract specification
```

### Package Dependencies

```
@app/contracts    # Types generated from OpenAPI
    ↓
@app/db          # Database client with encryption
    ↓
@app/interop     # File format parsers
    ↓
@app/providers-* # Provider integrations
    ↓
apps/*           # Applications consume all packages
```

---

## Technology Stack

### Backend (API)
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Runtime** | Node.js | >=18.18 | JavaScript runtime |
| **Framework** | Fastify | 5.6.1 | High-performance HTTP server |
| **Database** | PostgreSQL | 16 | Primary data store |
| **ORM** | Prisma | 5.22.0 | Type-safe database access |
| **Cache** | Redis | 7 | Sessions, rate limits, queues |
| **Storage** | S3/MinIO | Latest | Export file storage |
| **Validation** | Zod | 4.1.12 | Runtime schema validation |
| **Crypto** | TweetNaCl | 0.14.5 | Token encryption (libsodium) |
| **Auth** | jsonwebtoken | 9.0.2 | JWT session tokens |
| **Hashing** | bcrypt | 5.1.1 | Refresh token hashing |

### Mobile App
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | Expo | ~52.0.0 | React Native platform |
| **UI** | React Native | 0.76.5 | Cross-platform UI |
| **State** | React Query | 5.59.20 | Server state management |
| **API Client** | openapi-fetch | 0.13.3 | Type-safe API calls |
| **Storage** | SecureStore | ~14.0.0 | Encrypted token storage |
| **Auth** | expo-auth-session | ~6.0.2 | OAuth browser sessions |

### Infrastructure
| Service | Purpose | Port(s) |
|---------|---------|---------|
| **PostgreSQL 16** | Primary database | 5432 |
| **Redis 7** | Cache, sessions, queues | 6379 |
| **MinIO** | Local S3-compatible storage | 9000, 9001 |
| **API** | Backend server | 3101 |

---

## Data Flow Examples

### OAuth Authentication Flow (Mobile → API → Provider)

```
1. Mobile App
   ├─ Generate PKCE (code_verifier, code_challenge)
   └─ POST /auth/mobile/authorize { provider, code_challenge }

2. API
   ├─ Create oauth_attempt record (pending, expires in 10min)
   ├─ Build provider authorization URL
   └─ Return { attempt_id, authorization_url }

3. Mobile App
   ├─ Open system browser → authorization_url
   └─ User grants permission on Spotify/etc.

4. Provider
   └─ Redirect to API: /auth/callback/spotify?code=xxx&state=yyy

5. API
   ├─ Validate state (CSRF protection)
   ├─ Exchange code for tokens (using PKCE code_verifier)
   ├─ Fetch user profile
   ├─ Create/link user account
   ├─ Encrypt and store provider tokens
   ├─ Create session (JWT + refresh token)
   └─ Update oauth_attempt → succeeded

6. Mobile App
   ├─ Poll GET /auth/mobile/attempts/:id every 2s
   ├─ Receive { access_token, refresh_token }
   └─ Store in SecureStore
```

### Playlist Fetch with Auto Token Refresh

```
1. Mobile App
   └─ GET /playlists/spotify
      Headers: { Authorization: Bearer <session_jwt> }

2. API - Auth Middleware
   ├─ Verify JWT
   └─ Attach user to request

3. API - Route Handler
   ├─ Call getValidProviderToken(userId, 'spotify')
   │  ├─ Decrypt stored tokens
   │  ├─ Check if expired (5 min buffer)
   │  └─ If expired:
   │     ├─ Call Spotify refresh endpoint
   │     ├─ Encrypt new tokens
   │     ├─ Update database
   │     └─ Return fresh access_token
   │  └─ Else: return current access_token
   │
   ├─ Create SpotifyClient(access_token)
   ├─ Fetch playlists from Spotify API
   └─ Return { playlists: [...] }

4. Mobile App
   └─ Display playlists
```

### File Export Job

```
1. User
   └─ POST /exports/file { playlist_id, format: 'm3u' }

2. API
   ├─ Create job record (queued)
   ├─ Enqueue job to Redis
   └─ Return { job_id }

3. Worker
   ├─ Pop job from queue
   ├─ Fetch playlist items from database
   ├─ Generate M3U file
   ├─ Upload to S3: exports/{user_id}/{job_id}/playlist.m3u
   ├─ Update job: { status: succeeded, artifact_url: <s3_url> }
   └─ (Optional) Send webhook notification

4. User
   └─ Poll GET /jobs/:id
      └─ Receive { status: succeeded, artifact_url }
```

---

## Security Architecture

### Defense in Depth

1. **Network Layer**
   - HTTPS only in production
   - CORS whitelist validation
   - Rate limiting (100 req/min global, 10 req/min auth)

2. **Application Layer**
   - JWT authentication (7-day expiry)
   - Refresh token rotation (30-day expiry)
   - PKCE OAuth flow (prevents code interception)
   - State parameter (CSRF protection)
   - Idempotency keys (prevent duplicate mutations)

3. **Data Layer**
   - Provider tokens encrypted at rest (TweetNaCl/libsodium)
   - Refresh tokens hashed (bcrypt, 10 rounds)
   - Prepared statements (SQL injection prevention)
   - Master key rotation support

4. **Session Management**
   - Multi-device tracking
   - IP address and user agent logging
   - Individual or bulk session revocation
   - Automatic cleanup of expired sessions

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Man-in-the-Middle** | HTTPS only, certificate pinning (mobile) |
| **Token Theft** | Short-lived JWTs, refresh token rotation, encryption at rest |
| **CSRF** | State parameter in OAuth, SameSite cookies |
| **SQL Injection** | Prisma ORM with parameterized queries |
| **XSS** | CSP headers, input sanitization |
| **Brute Force** | Rate limiting, bcrypt for passwords |
| **Code Interception** | PKCE OAuth flow |
| **Replay Attacks** | Idempotency keys, nonce in OAuth |

---

## Scalability Considerations

### Current Bottlenecks (Single Instance)

1. **Stateless API**: Horizontal scaling ready (no in-memory state)
2. **Database**: Single PostgreSQL instance
3. **File Storage**: S3 (infinitely scalable)
4. **Cache**: Single Redis instance

### Scaling Strategy

#### Phase 1: Vertical Scaling (0-10K users)
- Increase PostgreSQL instance size
- Add read replicas for analytics queries
- Enable Redis persistence

#### Phase 2: Horizontal Scaling (10K-100K users)
- Deploy multiple API instances behind load balancer
- Database connection pooling (PgBouncer)
- Redis Cluster for high availability
- CDN for static assets

#### Phase 3: Sharding (100K+ users)
- Partition users by region or ID range
- Separate databases per provider (Spotify DB, Deezer DB)
- Implement event sourcing for playlist changes
- Message queue for async processing (RabbitMQ, Kafka)

---

## Observability

### Logging
- **Format**: Structured JSON (Pino)
- **Levels**: trace, debug, info, warn, error, fatal
- **Correlation**: Request ID in all logs
- **Sensitive Data**: Tokens redacted automatically

### Metrics (Prometheus)
- **Endpoint**: `GET /metrics`
- **Default Metrics**: HTTP request duration, response codes
- **Custom Metrics**: OAuth flow success rate, token refresh rate
- **Dashboards**: Grafana (recommended)

### Tracing
- **Future**: OpenTelemetry integration planned
- **Correlation**: Request ID propagated through async jobs

### Healthchecks
- **Liveness**: `GET /health` (always returns 200)
- **Readiness**: `GET /ready` (checks DB, Redis connectivity)

---

## Development Workflow

### Local Development
```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Run migrations
pnpm prisma:migrate:dev

# 3. Start API
pnpm api:dev

# 4. Start mobile app (separate terminal)
cd apps/mobile && pnpm start
```

### Testing
```bash
# Unit & integration tests
pnpm test

# Contract tests (OpenAPI compliance)
pnpm test:contract:dredd:server

# Property-based API tests
pnpm test:contract:st:server
```

### Code Generation
```bash
# Generate TypeScript types from OpenAPI
pnpm gen:types

# Generate Prisma client
pnpm prisma:generate
```

---

## Future Architecture

### Planned Enhancements

1. **Real-Time Features**
   - WebSocket support for live playlist updates
   - Server-Sent Events (SSE) for job progress (partially implemented)

2. **GraphQL API**
   - Complementary to REST API
   - Optimized for mobile bandwidth

3. **Microservices**
   - Separate services for: Auth, Playlists, Enrichment, Export
   - Service mesh (Istio/Linkerd)

4. **Event Sourcing**
   - Append-only event log for playlist changes
   - Time-travel debugging
   - Audit trail

5. **Multi-Region Deployment**
   - Active-active across regions
   - Data residency compliance (GDPR)

---

## Appendix: Key Design Decisions

### Why Fastify over Express?
- **Performance**: 2-3x faster in benchmarks
- **TypeScript**: First-class TypeScript support
- **Plugins**: Rich plugin ecosystem
- **Validation**: Built-in schema validation

### Why Prisma over TypeORM/Sequelize?
- **Type Safety**: Generated types match database schema
- **Migrations**: Declarative schema with automatic migrations
- **Query Builder**: Intuitive, type-safe query API
- **Performance**: Optimized query generation

### Why Expo over bare React Native?
- **Developer Experience**: Over-the-air updates, easy upgrades
- **Native Modules**: Managed workflow with pre-built modules
- **Cross-Platform**: Single codebase for iOS + Android
- **Tooling**: Expo Router, EAS Build, EAS Submit

### Why OpenAPI-First?
- **Documentation**: API docs auto-generated from spec
- **Type Safety**: TypeScript types generated from spec
- **Contract Testing**: Validate implementation against spec
- **Client Generation**: Mobile/web clients auto-generated

### Why pnpm over npm/yarn?
- **Disk Space**: Shared dependencies across projects
- **Speed**: Faster installs via content-addressable store
- **Strictness**: Prevents phantom dependencies
- **Workspaces**: Native monorepo support

---

## Conclusion

This architecture prioritizes:
- **Security**: Multiple layers of defense, encryption by default
- **Type Safety**: End-to-end type checking from database → API → clients
- **Scalability**: Stateless design, ready for horizontal scaling
- **Developer Experience**: Fast feedback loops, comprehensive tooling
- **Production Readiness**: Observability, testing, operational scripts

The contract-first approach ensures consistency across all consumers, and the modular package structure enables code reuse while maintaining clear boundaries.
