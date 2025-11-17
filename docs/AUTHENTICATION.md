# Authentication & Security Guide

## Overview

Playlist Manager implements a **multi-layered security architecture** combining OAuth 2.0 with PKCE, JWT session management, refresh token rotation, and encryption at rest. This guide covers the complete authentication flow, security mechanisms, and best practices.

---

## Table of Contents

1. [OAuth 2.0 PKCE Flow](#oauth-20-pkce-flow)
2. [Session Management](#session-management)
3. [Token Encryption](#token-encryption)
4. [Security Middleware](#security-middleware)
5. [Threat Mitigation](#threat-mitigation)
6. [Implementation Guide](#implementation-guide)

---

## OAuth 2.0 PKCE Flow

### What is PKCE?

**PKCE (Proof Key for Code Exchange, RFC 7636)** is an OAuth extension that prevents authorization code interception attacks. It's essential for mobile and public clients that cannot securely store client secrets.

### Flow Diagram

```
┌─────────────┐                              ┌──────────────┐
│  Mobile App │                              │   Our API    │
└──────┬──────┘                              └──────┬───────┘
       │                                            │
       │ 1. Generate PKCE                           │
       │    code_verifier = random(128 chars)       │
       │    code_challenge = SHA256(code_verifier)  │
       │                                            │
       │ 2. POST /auth/mobile/authorize             │
       │    { provider, code_challenge }            │
       ├──────────────────────────────────────────>│
       │                                            │
       │                        3. Create attempt   │
       │                           (expires 10 min) │
       │                                            │
       │ 4. { attempt_id, authorization_url }       │
       │<───────────────────────────────────────────┤
       │                                            │
       │ 5. Open browser                            │
       │    → authorization_url                     │
       │                                            │
       ↓                                            │
┌──────────────┐                                   │
│   Spotify    │                                   │
│   (Provider) │                                   │
└──────┬───────┘                                   │
       │                                            │
       │ 6. User grants permission                  │
       │                                            │
       │ 7. Redirect to callback                    │
       │    /auth/callback/spotify?code=XXX&state=YYY
       ├──────────────────────────────────────────>│
       │                                            │
       │                         8. Validate state  │
       │                            Exchange code   │
       │                            (with verifier) │
       │                                            │
       │ 9. Request tokens                          │
       │    { code, code_verifier }                 │
       │<───────────────────────────────────────────┤
       │                                            │
       │ 10. { access_token, refresh_token }        │
       ├──────────────────────────────────────────>│
       │                                            │
       │                    11. Fetch user profile  │
       │                        Create/link account │
       │                        Encrypt tokens      │
       │                        Create session      │
       │                        Update attempt      │
       │                                            │
┌──────────────┐                                   │
│  Mobile App  │                                   │
└──────┬───────┘                                   │
       │                                            │
       │ 12. Poll GET /auth/mobile/attempts/:id     │
       │     (every 2s, max 60s)                    │
       ├──────────────────────────────────────────>│
       │                                            │
       │ 13. { status: succeeded,                   │
       │       access_token (JWT),                  │
       │       refresh_token }                      │
       │<───────────────────────────────────────────┤
       │                                            │
       │ 14. Store in SecureStore                   │
       │     - session_token                        │
       │     - refresh_token                        │
       │                                            │
```

### Implementation Details

#### 1. PKCE Generation (Mobile)

```typescript
// apps/mobile/src/lib/pkce.ts
import * as Crypto from 'expo-crypto';

export function generateCodeVerifier(): string {
  const randomBytes = Crypto.getRandomBytes(32);
  return base64URLEncode(randomBytes);
}

export async function generateCodeChallenge(
  codeVerifier: string
): Promise<string> {
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return base64URLEncode(Buffer.from(hashed, 'base64'));
}

function base64URLEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

#### 2. Initiate OAuth (API)

```typescript
// POST /auth/mobile/authorize
const attempt = await createAttempt({
  provider: 'spotify',
  codeChallenge: body.code_challenge,
  redirectUri: body.redirect_uri,
  expiresInMinutes: 10,
});

const authorizationUrl = buildSpotifyAuthUrl({
  codeChallenge: body.code_challenge,
  state: attempt.state, // CSRF protection
  redirectUri: body.redirect_uri,
});

return {
  attempt_id: attempt.id,
  authorization_url: authorizationUrl,
  expires_at: attempt.expiresAt,
};
```

#### 3. OAuth Callback (API)

```typescript
// GET /auth/callback/:provider
const tokenResponse = await exchangeCodeForToken({
  code: query.code,
  codeVerifier: attempt.codeVerifier, // From database
  redirectUri: attempt.redirectUri,
});

const profile = await fetchProviderProfile(tokenResponse.access_token);

const user = await findOrCreateUser({
  email: profile.email,
  name: profile.display_name,
});

await linkProviderAccount({
  userId: user.id,
  provider,
  providerUserId: profile.id,
  accessToken: tokenResponse.access_token,  // Encrypted
  refreshToken: tokenResponse.refresh_token, // Encrypted
  expiresIn: tokenResponse.expires_in,
});

const session = await createSession({
  userId: user.id,
  deviceInfo: request.headers['user-agent'],
  ipAddress: request.ip,
});

await succeedAttempt(
  attempt.id,
  user.id,
  session.accessToken,     // JWT
  session.refreshToken,    // For rotation
  tokenResponse.expires_in
);
```

#### 4. Polling (Mobile)

```typescript
// apps/mobile/src/auth/startMobileOauth.ts
async function pollOAuthAttempt(attemptId: string): Promise<OAuthResult> {
  const maxAttempts = 30; // 60 seconds (2s interval)

  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await apiClient.GET('/auth/mobile/attempts/{id}', {
      params: { path: { id: attemptId } },
    });

    if (data.status === 'succeeded') {
      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    }

    if (data.status === 'failed' || data.status === 'expired') {
      return {
        success: false,
        error: data.error,
        errorDescription: data.error_description,
      };
    }

    // Still pending, wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return { success: false, error: 'timeout' };
}
```

### Security Properties

| Property | Implementation | Protection Against |
|----------|----------------|-------------------|
| **Code Verifier** | Random 128-char string | Code interception |
| **Code Challenge** | SHA-256 hash | Reverse engineering |
| **State Parameter** | Random CUID | CSRF attacks |
| **Attempt Expiration** | 10 minutes | Replay attacks |
| **HTTPS Only** | TLS 1.2+ | MITM attacks |
| **SecureStore** | Encrypted keychain | Token theft |

---

## Session Management

### Token Types

#### 1. Access Token (JWT)

**Purpose**: Authenticate API requests
**Lifetime**: 7 days (configurable via `JWT_EXPIRES_IN`)
**Storage**: Mobile - SecureStore, Web - HttpOnly cookie
**Format**: JWT (JSON Web Token)

**Claims**:
```json
{
  "userId": 123,
  "email": "user@example.com",
  "provider": "session",
  "iat": 1700000000,
  "exp": 1700604800,
  "iss": "playlist-manager",
  "aud": "playlist-manager-api"
}
```

**Verification** (API):
```typescript
// apps/api/src/lib/auth/session.ts
export function verifySession(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'playlist-manager',
      audience: 'playlist-manager-api',
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
```

#### 2. Refresh Token

**Purpose**: Obtain new access tokens
**Lifetime**: 30 days
**Storage**: Database (bcrypt hashed), Mobile/Web (encrypted)
**Format**: Opaque string (`rt_` + 48-char nanoid)

**Hashing**:
```typescript
import bcrypt from 'bcrypt';

const refreshToken = `rt_${nanoid(48)}`;
const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

await prisma.session.create({
  data: {
    refresh_token_hash: refreshTokenHash,
    token_family: `fam_${nanoid(24)}`, // For rotation detection
    // ...
  },
});
```

### Refresh Token Rotation

**Why?** Mitigates token theft - if a refresh token is reused, all tokens in the family are revoked.

**Flow**:
```
Client sends:     RT_1

Server:
  1. Verify RT_1 hash matches database
  2. Generate new tokens: AT_2, RT_2
  3. Hash RT_2, store in database
  4. Invalidate RT_1
  5. Return AT_2, RT_2

Client stores:    AT_2, RT_2

Next refresh uses RT_2 (RT_1 is dead)
```

**Implementation**:
```typescript
// POST /auth/refresh
const result = await refreshAccessToken(body.refresh_token);

if (!result.success) {
  return reply.status(401).send({
    code: 'invalid_refresh_token',
    message: result.error,
  });
}

return reply.status(200).send({
  access_token: result.accessToken,   // New JWT
  refresh_token: result.refreshToken, // New rotation
  token_type: 'Bearer',
  expires_in: 604800, // 7 days
});
```

### Session Tracking

**Database Schema**:
```prisma
model Session {
  id                 String    @id @default(cuid())
  user_id            Int
  token_family       String    // For rotation detection
  refresh_token_hash String    // Bcrypt hash
  access_token_jti   String?   // JWT ID (future: revocation)
  device_info        String?   // User agent
  ip_address         String?   // IP address
  created_at         DateTime  @default(now())
  last_used_at       DateTime  @default(now())
  expires_at         DateTime  // 30 days
  revoked_at         DateTime? // NULL if active

  @@index([user_id])
  @@index([token_family])
  @@index([expires_at])
}
```

### Multi-Device Support

Users can have multiple active sessions (different devices). Each session has:
- Unique `id` and `token_family`
- `device_info` (user agent) and `ip_address` for auditing
- Independent expiration and revocation

**List User Sessions**:
```http
GET /me/sessions
Authorization: Bearer <access_token>

Response:
{
  "sessions": [
    {
      "session_id": "sess_abc123",
      "device_info": "Mozilla/5.0 (iPhone; iOS 17.0)",
      "ip_address": "192.168.1.100",
      "created_at": "2024-01-01T00:00:00Z",
      "last_used_at": "2024-01-05T12:34:56Z",
      "expires_at": "2024-01-31T00:00:00Z"
    }
  ]
}
```

**Revoke Session** (logout):
```http
POST /auth/logout
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "session_id": "sess_abc123"  // Optional, revokes all if omitted
}
```

---

## Token Encryption

### Provider Token Storage

Provider access tokens (Spotify, Deezer, etc.) are **encrypted at rest** using **TweetNaCl (libsodium)** with the `crypto_secretbox` primitive.

### Encryption Format

```
pmse-v1.<keyId>.<payload>
```

- **`pmse-v1`**: Prefix indicating version
- **`keyId`**: Identifier for master key (supports rotation)
- **`payload`**: Base64-encoded ciphertext (nonce + encrypted data)

### Implementation

```typescript
// packages/db/src/encryption/crypto.ts
import nacl from 'tweetnacl';

export function seal(plaintext: string, keystore: Keystore): string {
  const key = keystore.getActiveKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageUint8 = new TextEncoder().encode(plaintext);

  const box = nacl.secretbox(messageUint8, nonce, key.bytes);

  const payload = new Uint8Array(nonce.length + box.length);
  payload.set(nonce);
  payload.set(box, nonce.length);

  return `pmse-v1.${key.id}.${Buffer.from(payload).toString('base64')}`;
}

export function open(sealed: string, keystore: Keystore): string {
  const [prefix, keyId, payloadB64] = sealed.split('.');
  if (prefix !== 'pmse-v1') throw new Error('Invalid sealed secret');

  const key = keystore.getKey(keyId);
  const payload = Buffer.from(payloadB64, 'base64');

  const nonce = payload.slice(0, nacl.secretbox.nonceLength);
  const box = payload.slice(nacl.secretbox.nonceLength);

  const opened = nacl.secretbox.open(box, nonce, key.bytes);
  if (!opened) throw new Error('Decryption failed');

  return new TextDecoder().decode(opened);
}
```

### Key Rotation

**Environment Variables**:
```bash
MASTER_KEY=current-key-base64-encoded
MASTER_KEY_PREVIOUS=old-key-base64-encoded  # Optional
```

**Rotation Process**:
1. Set `MASTER_KEY_PREVIOUS` to current key
2. Generate new key: `openssl rand -base64 32`
3. Set `MASTER_KEY` to new key
4. Run rotation script: `pnpm tsx scripts/rotate-token-key.ts`
   - Re-encrypts all tokens with new key
   - Updates `keyId` in sealed secrets
5. Remove `MASTER_KEY_PREVIOUS` after verification

### Storage in Database

```prisma
model Account {
  id                       Int       @id
  access_token_ciphertext  String?   // pmse-v1.key1.Ab3d...
  refresh_token_ciphertext String?   // pmse-v1.key1.Xy9z...
  expires_at               DateTime?
}
```

### Usage Example

```typescript
// Encrypt before storing
const keystore = createKeystore({ masterKey: env.MASTER_KEY });
const encrypted = encryptProviderTokens(
  {
    accountId: account.id,
    accessToken: 'spotify_access_token_here',
    refreshToken: 'spotify_refresh_token_here',
  },
  keystore
);

await prisma.account.update({
  where: { id: account.id },
  data: {
    access_token_ciphertext: encrypted.access_token_ciphertext,
    refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
  },
});

// Decrypt when needed
const decrypted = decryptProviderTokens(
  {
    accountId: account.id,
    access_token_ciphertext: account.access_token_ciphertext,
    refresh_token_ciphertext: account.refresh_token_ciphertext,
  },
  keystore
);

const spotifyClient = new SpotifyClient({ token: decrypted.accessToken });
```

---

## Security Middleware

### 1. JWT Authentication Plugin

```typescript
// apps/api/src/plugins/auth.ts
fastify.decorate('authenticate', async (request, reply) => {
  const session = verifySessionFromHeader(request.headers.authorization);

  if (!session) {
    return reply.status(401).send({
      code: 'unauthorized',
      message: 'Invalid or expired token',
    });
  }

  request.user = session; // { userId, email, provider }
});

fastify.decorate('optionalAuth', async (request, reply) => {
  const session = verifySessionFromHeader(request.headers.authorization);
  if (session) {
    request.user = session;
  }
  // Don't reject if missing
});
```

**Usage in Routes**:
```typescript
fastify.get('/playlists/spotify', {
  preHandler: fastify.authenticate, // Require auth
  handler: async (request, reply) => {
    const userId = request.user!.userId; // TypeScript knows user exists
    // ...
  },
});
```

### 2. CORS Plugin

```typescript
// apps/api/src/plugins/cors.ts
const allowedOrigins = env.CORS_ORIGINS.split(',').map(s => s.trim());

await fastify.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true); // Allow requests with no origin (mobile apps)
      return;
    }

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
});
```

**Configuration**:
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:19006,https://app.example.com
```

### 3. Rate Limiting Plugin

```typescript
// apps/api/src/plugins/rate-limit.ts
await fastify.register(rateLimit, {
  global: true,
  max: 100,            // 100 requests
  timeWindow: '1 minute',
  redis: redisClient,  // Distributed rate limiting

  errorResponseBuilder: (request, context) => ({
    type: 'about:blank',
    code: 'rate_limited',
    message: 'Too many requests',
    details: {
      request_id: request.id,
      limit: context.max,
      retry_after: Math.ceil(context.ttl / 1000), // seconds
    },
  }),

  // Per-route overrides
  keyGenerator: (request) => {
    if (request.url.startsWith('/auth/')) return `auth:${request.ip}`;
    if (request.url.startsWith('/jobs/')) return `jobs:${request.ip}`;
    return request.ip;
  },
});

// Stricter limits for sensitive routes
fastify.get('/auth/mobile/authorize', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  // ...
});
```

**Rate Limit Headers** (returned in responses):
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1700000060
Retry-After: 60  # (if rate limited)
```

### 4. Idempotency Plugin

Prevents duplicate mutations for retried requests.

```typescript
// apps/api/src/plugins/idempotency.ts
fastify.addHook('onRequest', async (request, reply) => {
  const idempotencyKey = request.headers['idempotency-key'];

  if (!idempotencyKey) return; // Optional

  const cached = await idempotencyStore.get(idempotencyKey);

  if (cached) {
    // Return cached response
    reply.status(cached.statusCode).send(cached.body);
    return reply;
  }

  // Store key -> response mapping
  reply.addHook('onSend', async (req, rep, payload) => {
    await idempotencyStore.set(idempotencyKey, {
      statusCode: rep.statusCode,
      body: payload,
    }, env.IDEMPOTENCY_TTL_SECONDS);
  });
});
```

**Client Usage**:
```http
POST /exports/file
Idempotency-Key: unique-key-per-request
Content-Type: application/json

{ "playlist_id": 123, "format": "m3u" }
```

---

## Threat Mitigation

### Attack Vector Matrix

| Attack | Mitigation | Status |
|--------|-----------|--------|
| **Authorization Code Interception** | PKCE flow with code_challenge | ✅ Implemented |
| **CSRF on OAuth Callback** | State parameter validation | ✅ Implemented |
| **Token Theft (Network)** | HTTPS only, short-lived JWTs | ✅ Implemented |
| **Token Theft (Device)** | SecureStore encryption | ✅ Implemented |
| **Token Theft (Database)** | TweetNaCl encryption at rest | ✅ Implemented |
| **Refresh Token Reuse** | Token rotation with family tracking | ✅ Implemented |
| **Brute Force Login** | Rate limiting (10 req/min) | ✅ Implemented |
| **Replay Attacks** | Idempotency keys, nonce, expiration | ✅ Implemented |
| **SQL Injection** | Prisma ORM (parameterized queries) | ✅ Implemented |
| **XSS** | CSP headers, input sanitization | ⚠️ Partial |
| **Session Hijacking** | IP/device tracking, revocation | ✅ Implemented |
| **Timing Attacks** | Constant-time comparisons (bcrypt) | ✅ Implemented |

### Security Headers (Future)

```typescript
// Recommended CSP
Content-Security-Policy: default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.spotify.com;

// Other headers
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

## Implementation Guide

### Adding a New OAuth Provider

1. **Update Environment Schema** (`apps/api/src/config/env.ts`):
```typescript
NEWPROVIDER_CLIENT_ID: z.string().optional(),
NEWPROVIDER_CLIENT_SECRET: z.string().optional(),
NEWPROVIDER_REDIRECT_URI: z.string().url().optional(),
ENABLE_NEWPROVIDER: z.coerce.boolean().default(false),
```

2. **Create Provider Module** (`apps/api/src/lib/auth/providers/newprovider.ts`):
```typescript
export async function buildNewProviderAuthUrl(params: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
}): Promise<string> {
  // Build authorization URL
}

export async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  // Exchange code for tokens
}

export async function fetchNewProviderProfile(
  accessToken: string
): Promise<UserProfile> {
  // Fetch user profile
}

export async function refreshNewProviderToken(
  refreshToken: string
): Promise<TokenResponse> {
  // Refresh access token
}
```

3. **Update OAuth Callback** (`apps/api/src/routes/auth.callback.ts`):
```typescript
case 'newprovider': {
  const tokenResponse = await exchangeNewProviderCodeForToken({ ... });
  const profile = await fetchNewProviderProfile(tokenResponse.access_token);
  // ...
  break;
}
```

4. **Add Token Refresh Support** (`apps/api/src/lib/auth/tokens.ts`):
```typescript
case 'newprovider': {
  const refreshed = await refreshNewProviderToken(tokens.refreshToken);
  // Update database...
  return refreshed.access_token;
}
```

### Mobile Integration Checklist

- [ ] Generate PKCE code_verifier and code_challenge
- [ ] Call POST `/auth/mobile/authorize`
- [ ] Open WebBrowser with `authorization_url`
- [ ] Handle deep link callback (`pm://auth/callback`)
- [ ] Poll GET `/auth/mobile/attempts/:id`
- [ ] Store `access_token` and `refresh_token` in SecureStore
- [ ] Include `Authorization: Bearer <token>` header in API requests
- [ ] Implement token refresh logic (POST `/auth/refresh`)
- [ ] Handle 401 errors (expired token)

### Testing Authentication

```bash
# 1. Start local services
docker-compose up -d

# 2. Set environment variables
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_secret
export SPOTIFY_REDIRECT_URI=http://localhost:3101/api/v1/auth/callback/spotify

# 3. Start API
pnpm api:dev

# 4. Test OAuth flow
curl -X POST http://localhost:3101/api/v1/auth/mobile/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "spotify",
    "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    "redirect_uri": "pm://auth/callback"
  }'

# Expected response:
# {
#   "attempt_id": "att_abc123",
#   "authorization_url": "https://accounts.spotify.com/authorize?...",
#   "expires_at": "2024-01-01T00:10:00Z"
# }
```

---

## Conclusion

This authentication system provides:
- **Defense in Depth**: Multiple security layers
- **Zero Trust**: Every request authenticated and validated
- **Privacy**: Tokens encrypted at rest and in transit
- **Auditability**: Session tracking with IP and device info
- **Scalability**: Stateless JWT design
- **Resilience**: Automatic token refresh, graceful degradation

For production deployment, ensure:
1. HTTPS only (TLS 1.2+ with valid certificates)
2. Rotate `MASTER_KEY` periodically
3. Monitor authentication metrics (success rate, refresh rate)
4. Set up alerts for unusual activity (mass token refresh, geolocation anomalies)
5. Implement rate limiting at infrastructure level (WAF, API Gateway)
