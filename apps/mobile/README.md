# Playlist Manager - Mobile App

Expo React Native mobile application with TypeScript.

## Features

- ✅ Expo 52 with TypeScript
- ✅ Deep linking support (scheme: `pm://`)
- ✅ OpenAPI-typed API client
- ✅ React Query for data fetching
- ✅ Expo Auth Session for OAuth
- ✅ Secure Store for token storage
- 🚧 OAuth PKCE flow (task 10b)
- 🚧 Session management (task 10l)
- 🚧 Playlist MVP (task 10c)

## Development

### Prerequisites

- Node.js >= 18.18
- pnpm 9.12.3
- Expo CLI (optional, uses `npx expo`)

### Install Dependencies

```bash
pnpm install
```

### Run the App

```bash
# Start development server
pnpm --filter ./apps/mobile start

# Run on iOS
pnpm --filter ./apps/mobile ios

# Run on Android
pnpm --filter ./apps/mobile android

# Run on Web
pnpm --filter ./apps/mobile web
```

## Deep Linking

The app is configured with the custom scheme `pm://`.

- Auth callback: `pm://auth/callback`
- Test deep link: `pm://test`

To test deep linking in development:

```bash
# iOS
xcrun simctl openurl booted "pm://auth/callback?code=test"

# Android
adb shell am start -W -a android.intent.action.VIEW -d "pm://auth/callback?code=test"
```

## API Client

The app uses `openapi-fetch` with type-safe bindings to the backend API:

```typescript
import apiClient from './src/api';

// All API calls are fully typed
const { data, error } = await apiClient.GET('/playlists');
```

## Project Structure

```
apps/mobile/
├── src/
│   ├── api.ts                 # OpenAPI client
│   ├── auth/
│   │   └── startMobileOauth.ts # OAuth flow (task 10b)
│   └── screens/
│       └── HomeScreen.tsx      # Home screen
├── assets/                     # Images and icons
├── App.tsx                     # Root component
├── app.json                    # Expo config (static)
├── app.config.ts              # Expo config (dynamic)
└── package.json
```

## Tasks

- ✅ **10a**: Mobile scaffold with deep links and API client
- 🚧 **10b**: Mobile OAuth PKCE flow
- 🚧 **10c**: Mobile playlist MVP
- 🚧 **10e**: OpenAPI auth completion
- 🚧 **10f**: Environment and secrets
- 🚧 **10d**: Backend OAuth callbacks
- 🚧 **10l**: Session management
- 🚧 **10m**: OAuth state/nonce/CSRF protection
