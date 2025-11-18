# Manual Setup & Testing Guide

This guide walks you through setting up the playlist-manager application stack locally and testing all functionality end-to-end.

## Prerequisites

Before starting, ensure you have:

- **Node.js 20+** installed
- **pnpm** installed (`npm install -g pnpm`)
- **PostgreSQL 16** running locally
- **Spotify Developer Account** (for OAuth testing)
- **iOS Simulator** (Mac) or **Android Emulator** or **Physical Device** (for mobile testing)
- **Expo Go app** installed on your mobile device (optional, for physical device testing)

## Part 1: Environment Setup

### 1.1 Clone and Install Dependencies

```bash
cd /home/user/playlist-manager

# Install all dependencies
pnpm install
```

### 1.2 Create Environment File

Create `.env` in the project root:

```bash
cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public

# Encryption (REQUIRED - generate a 32-byte base64 key)
MASTER_KEY=dGVzdF9rZXlfZXhhY3RseV8zMl9ieXRlc194ISE=

# API Configuration
API_PORT=3101
API_URL=http://localhost:3101
NODE_ENV=development

# Spotify OAuth (get from https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3101/auth/callback/spotify

# Feature Flags
PROVIDER_SPOTIFY_ENABLED=true
PROVIDER_DEEZER_ENABLED=false
PROVIDER_TIDAL_ENABLED=false
PROVIDER_YOUTUBE_ENABLED=false

# Session Configuration
SESSION_SECRET=your_session_secret_at_least_32_chars_long_please_change_me
SESSION_EXPIRES_IN=7d
EOF
```

**Important:** Update `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` with your actual credentials.

### 1.3 Generate Master Encryption Key

If you want to generate a proper 32-byte encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Replace the `MASTER_KEY` value in `.env` with the generated key.

## Part 2: Spotify OAuth Setup

### 2.1 Create Spotify Application

1. Go to https://developer.spotify.com/dashboard
2. Click "Create app"
3. Fill in:
   - **App name:** Playlist Manager Local Dev
   - **App description:** Local development testing
   - **Redirect URIs:**
     - `http://localhost:3101/auth/callback/spotify`
     - `pm://auth/callback` (for mobile)
   - **APIs used:** Web API
4. Save the app
5. Copy **Client ID** and **Client Secret** to your `.env` file

### 2.2 Update .env with Spotify Credentials

```bash
# Update these lines in .env
SPOTIFY_CLIENT_ID=<your_client_id>
SPOTIFY_CLIENT_SECRET=<your_client_secret>
```

## Part 3: Database Setup

### 3.1 Start PostgreSQL

Ensure PostgreSQL is running:

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# If not running, start it (varies by OS):
# macOS (Homebrew):
brew services start postgresql@16

# Linux (systemd):
sudo systemctl start postgresql

# Docker:
docker run -d \
  --name playlist-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=playlistmgr \
  -p 5432:5432 \
  postgres:16
```

### 3.2 Create Database

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres

# Create database
CREATE DATABASE playlistmgr;

# Exit
\q
```

### 3.3 Run Migrations

```bash
# Generate Prisma client
pnpm --filter @app/db exec prisma generate

# Run migrations
pnpm --filter @app/db exec prisma migrate deploy

# Verify migrations
pnpm --filter @app/db exec prisma migrate status
```

Expected output: All migrations applied successfully.

### 3.4 Seed Database (Optional)

```bash
pnpm --filter @app/db exec prisma db seed
```

This creates sample data for testing.

### 3.5 Verify Database Schema

```bash
# Connect to database
psql -h localhost -U postgres -d playlistmgr

# List tables
\dt

# Check users table
\d "user"

# Check accounts table (should have ciphertext columns)
\d account

# Exit
\q
```

You should see columns like `access_token_ciphertext` and `refresh_token_ciphertext`.

## Part 4: Start API Server

### 4.1 Generate API Types

```bash
# Generate TypeScript types from OpenAPI spec
pnpm gen:types

# Verify generation
ls -la packages/contracts/src/api.types.ts
```

### 4.2 Start Development Server

```bash
# Start API server
pnpm --filter @app/api dev
```

Expected output:
```
[playlist-manager] API listening on http://0.0.0.0:3101
```

### 4.3 Verify API Health

In a new terminal:

```bash
# Health check
curl http://localhost:3101/health

# Expected: {"status":"ok"}

# Check enabled providers
curl http://localhost:3101/api/v1/auth/providers

# Expected: {"data":[{"name":"spotify"}]}

# Check API docs
curl http://localhost:3101/docs
```

Open http://localhost:3101/docs in your browser to see Swagger UI.

## Part 5: Test API Endpoints

### 5.1 Test Database Health

```bash
curl http://localhost:3101/api/v1/health/db
```

Expected: `{"status":"ok","database":"connected"}`

### 5.2 Test OAuth Flow (Web - Manual)

1. **Initiate Mobile OAuth:**

```bash
curl -X POST http://localhost:3101/api/v1/auth/mobile/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "spotify",
    "code_challenge": "dGVzdF9jb2RlX2NoYWxsZW5nZV9leGFtcGxlXzEyMzQ1Njc4OTA",
    "redirect_uri": "pm://auth/callback"
  }'
```

2. **Save the response:**
   - Note the `attempt_id`
   - Copy the `authorization_url`

3. **Open authorization URL in browser:**
   - Paste the `authorization_url` in your browser
   - Log in with Spotify
   - Authorize the application
   - You'll be redirected to `pm://auth/callback?...`

4. **Poll for completion:**

```bash
curl http://localhost:3101/api/v1/auth/mobile/attempts/{attempt_id}
```

Replace `{attempt_id}` with your actual attempt ID.

Expected response (after authorization):
```json
{
  "attempt_id": "att_...",
  "status": "succeeded",
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "expires_in": 3600,
  ...
}
```

5. **Save the access_token** - you'll need it for authenticated requests.

### 5.3 Test Protected Endpoints

```bash
# Set your session token
export SESSION_TOKEN="<access_token_from_above>"

# Fetch Spotify playlists
curl -H "Authorization: Bearer $SESSION_TOKEN" \
  http://localhost:3101/api/v1/playlists/spotify

# Expected: {"playlists":[...]}

# Get playlist items (replace {id} with actual playlist ID)
curl -H "Authorization: Bearer $SESSION_TOKEN" \
  http://localhost:3101/api/v1/playlists/{id}/items

# Expected: {"items":[...]}
```

### 5.4 Test Export Functionality

```bash
# Export playlist to CSV
curl -X POST http://localhost:3101/api/v1/exports/file \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "playlist_id": "{your_playlist_id}",
    "format": "csv",
    "variant": "lean"
  }'

# Expected: {"job_id":"job_..."}

# Check job status
curl -H "Authorization: Bearer $SESSION_TOKEN" \
  http://localhost:3101/api/v1/jobs/{job_id}

# When complete, download file
curl -H "Authorization: Bearer $SESSION_TOKEN" \
  http://localhost:3101/api/v1/exports/{job_id}/download \
  --output playlist.csv
```

## Part 6: Mobile App Setup

### 6.1 Configure Mobile Environment

Create `apps/mobile/.env`:

```bash
cat > apps/mobile/.env << 'EOF'
API_URL=http://localhost:3101
EOF
```

**Note:** For physical devices, replace `localhost` with your computer's local IP address (e.g., `http://192.168.1.100:3101`).

### 6.2 Find Your Local IP (for Physical Device Testing)

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or use:
hostname -I

# Update .env with your IP
echo "API_URL=http://192.168.1.X:3101" > apps/mobile/.env
```

### 6.3 Start Metro Bundler

```bash
cd apps/mobile

# Install Expo CLI globally if needed
npm install -g expo-cli

# Start Expo
pnpm start
```

### 6.4 Run on Simulator/Device

You'll see a QR code and options:

**Option A: iOS Simulator (Mac only)**
```bash
# Press 'i' in the Metro terminal
# Or:
pnpm ios
```

**Option B: Android Emulator**
```bash
# Press 'a' in the Metro terminal
# Or:
pnpm android
```

**Option C: Physical Device**
1. Install **Expo Go** app from App Store / Play Store
2. Scan the QR code shown in terminal
3. App will load on your device

## Part 7: Test Mobile App End-to-End

### 7.1 Initial Load

When the app opens, you should see:
- **Home Screen** with "Playlist Manager" title
- "Sign in with Spotify" button
- Deep link info: `pm://auth/callback`

### 7.2 Test OAuth Flow

1. **Tap "Sign in with Spotify"**
   - Should show "Authenticating..." loading state
   - Browser opens with Spotify login

2. **Authorize in Browser**
   - Log in to Spotify (if not already)
   - Click "Agree" to authorize
   - Browser shows success message
   - Return to the app

3. **Success Alert**
   - Should see "Success!" alert
   - "You are now signed in. Session token has been stored securely."
   - Tap OK

4. **Navigate to Playlists**
   - Should automatically navigate to Playlists screen
   - Shows "Your Playlists" header
   - Lists your Spotify playlists with:
     - Playlist name
     - Track count
     - "View Playlist" button

### 7.3 Test Playlist Viewing

1. **Pull to Refresh**
   - Pull down on the playlists list
   - Should reload playlists from API

2. **Tap a Playlist**
   - Tap "View Playlist" on any playlist
   - Should navigate to Playlist Detail screen
   - Shows:
     - Playlist name as header
     - "← Back" button
     - List of tracks with:
       - Track title
       - Artist names
       - Album name
       - Duration

3. **Scroll Through Tracks**
   - Verify all tracks load
   - Check track metadata is displayed correctly

### 7.4 Test Export Functionality

1. **Tap Export CSV**
   - Tap the "Export CSV" button
   - Should see "Export Started" alert with job ID
   - Tap OK

2. **Wait for Completion**
   - Status should update automatically (polling every 2 seconds)
   - Watch the UI update as job progresses:
     - "Queued..." → "Running..." → "Completed!"

3. **Completion Alert**
   - Should see "Export Complete!" alert
   - "Your playlist has been exported successfully"
   - Tap OK

4. **Try Other Formats**
   - Tap "Export M3U" - should work same way
   - Tap "Export XSPF" - should work same way

### 7.5 Test Navigation

1. **Back Button**
   - Tap "← Back" button
   - Should return to playlists list

2. **Sign Out**
   - Tap "Sign Out" button on playlists screen
   - Should see confirmation
   - Returns to Home screen
   - Session cleared

### 7.6 Test Persistence

1. **Close and Reopen App**
   - Force quit the app
   - Reopen it
   - If previously signed in, should automatically go to Playlists screen
   - If signed out, should show Home screen

## Part 8: Verify Encryption at Rest

### 8.1 Check Database for Encrypted Tokens

```bash
# Connect to database
psql -h localhost -U postgres -d playlistmgr

# Query accounts table
SELECT
  id,
  provider,
  provider_user_id,
  access_token,  -- Should be NULL
  refresh_token, -- Should be NULL
  access_token_ciphertext,  -- Should contain "pmse-v1...."
  refresh_token_ciphertext, -- Should contain "pmse-v1...."
  LENGTH(access_token_ciphertext) as cipher_length
FROM account
LIMIT 1;
```

**Expected Result:**
- `access_token`: NULL ✅
- `refresh_token`: NULL ✅
- `access_token_ciphertext`: `pmse-v1.key_....` (encrypted) ✅
- `refresh_token_ciphertext`: `pmse-v1.key_....` (encrypted) ✅
- `cipher_length`: > 100 characters ✅

**Critical:** Plaintext columns MUST be NULL. If they contain tokens, encryption is NOT working!

### 8.2 Verify CSRF Protection

```bash
# Attempt POST without CSRF token (should fail)
curl -X POST http://localhost:3101/api/v1/exports/file \
  -H "Content-Type: application/json" \
  -d '{"playlist_id":"123","format":"csv"}'

# Expected: 403 Forbidden - CSRF token invalid

# With Bearer token (should work - exempt from CSRF)
curl -X POST http://localhost:3101/api/v1/exports/file \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playlist_id":"123","format":"csv"}'

# Expected: 200 OK or 400 (with validation error, not CSRF error)
```

## Part 9: Deep Links Testing

### 9.1 Test Custom Scheme (pm://)

**On iOS Simulator:**
```bash
xcrun simctl openurl booted "pm://auth/callback?code=test123&state=test_state"
```

**On Android Emulator:**
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "pm://auth/callback?code=test123&state=test_state" \
  com.playlistmanager.app
```

**Expected:** App opens and processes the deep link.

### 9.2 Verify .well-known Files

```bash
# Apple App Site Association
curl http://localhost:3101/.well-known/apple-app-site-association

# Expected: JSON with applinks configuration

# Android Asset Links
curl http://localhost:3101/.well-known/assetlinks.json

# Expected: JSON with android_app configuration
```

## Part 10: Common Issues & Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check DATABASE_URL in .env is correct
grep DATABASE_URL .env

# Test connection manually
psql postgresql://postgres:postgres@localhost:5432/playlistmgr
```

### API Server Won't Start

```bash
# Check port 3101 is not in use
lsof -i :3101

# Kill process if needed
kill -9 <PID>

# Check .env file exists
ls -la .env

# Check all env vars are set
node -e "require('dotenv').config(); console.log(process.env.SPOTIFY_CLIENT_ID)"
```

### Mobile App Can't Connect to API

1. **Localhost Issue:** Use your computer's local IP instead
   ```bash
   # Find IP
   ifconfig | grep "inet "

   # Update apps/mobile/.env
   API_URL=http://192.168.1.X:3101
   ```

2. **Firewall Blocking:** Allow port 3101
   ```bash
   # macOS
   sudo pfctl -d  # Disable firewall temporarily

   # Or add rule for port 3101
   ```

3. **Check API is accessible:**
   ```bash
   # From your device's IP range
   curl http://192.168.1.X:3101/health
   ```

### OAuth Redirect Not Working

1. **Check Spotify Redirect URI** matches `.env`:
   ```
   SPOTIFY_REDIRECT_URI=http://localhost:3101/auth/callback/spotify
   ```

2. **Check Spotify Dashboard** includes redirect URI

3. **Check mobile redirect** `pm://auth/callback` is in Spotify dashboard

### Encryption Errors

```bash
# Verify MASTER_KEY is set and valid
node -e "
const key = Buffer.from(process.env.MASTER_KEY || '', 'base64');
console.log('Key length:', key.length, 'bytes');
console.log('Valid:', key.length === 32 ? 'YES' : 'NO - Must be 32 bytes');
"

# If invalid, generate new key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Session Expired / Invalid Token

```bash
# Get fresh token by re-authenticating
# Or check token expiration
node -e "
const jwt = require('jsonwebtoken');
const token = process.env.SESSION_TOKEN;
const decoded = jwt.decode(token);
console.log('Expires:', new Date(decoded.exp * 1000));
"
```

## Part 11: Success Criteria Checklist

Use this checklist to verify everything works:

### API Server
- [ ] Server starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] Database connection successful
- [ ] API docs accessible at `/docs`
- [ ] Providers endpoint lists Spotify

### OAuth Flow
- [ ] Mobile authorize creates attempt
- [ ] Browser opens with Spotify login
- [ ] Callback processes successfully
- [ ] Polling returns session token
- [ ] Tokens stored as ciphertext ONLY (verified in DB)

### Protected Endpoints
- [ ] Playlists endpoint requires auth
- [ ] Playlists endpoint returns data with valid token
- [ ] Playlist items endpoint works
- [ ] Export endpoint creates job
- [ ] Job status polling works

### Mobile App
- [ ] App builds and runs
- [ ] Home screen displays correctly
- [ ] Sign in button triggers OAuth
- [ ] Browser opens for authorization
- [ ] Returns to app after auth
- [ ] Navigates to playlists screen
- [ ] Playlists load and display
- [ ] Tapping playlist shows tracks
- [ ] Export buttons work
- [ ] Job status updates automatically
- [ ] Back navigation works
- [ ] Sign out clears session

### Security
- [ ] Database shows encrypted tokens (pmse-v1.*)
- [ ] Plaintext columns are NULL
- [ ] CSRF protection blocks unauthorized requests
- [ ] Bearer tokens exempt from CSRF
- [ ] State parameter validated on callback

### Deep Links
- [ ] Custom scheme (pm://) configured
- [ ] .well-known files accessible
- [ ] Deep links open app (if tested)

## Part 12: Next Steps

Once everything is working:

1. **Create production environment:**
   - Set up production database
   - Configure production Spotify app
   - Generate production encryption keys
   - Update deep link domains

2. **Deploy API:**
   - Deploy to hosting platform
   - Update API_URL in mobile app
   - Configure HTTPS
   - Update Spotify redirect URIs

3. **Build mobile app:**
   - Replace Team ID in apple-app-site-association
   - Generate Android signing key
   - Update SHA-256 fingerprint in assetlinks.json
   - Build for TestFlight / Play Store

4. **Monitor & iterate:**
   - Check logs for errors
   - Monitor encryption usage
   - Track OAuth success rate
   - Gather user feedback

---

## Support

If you encounter issues not covered here:

1. Check application logs: API server console output
2. Check database logs: `psql` query results
3. Check mobile logs: Metro bundler output or device logs
4. Review error messages carefully - they usually indicate the issue

Good luck! 🚀
