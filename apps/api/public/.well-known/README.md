# Universal Links / App Links Configuration

This directory contains the configuration files for iOS Universal Links and Android App Links.

## iOS Universal Links

**File**: `apple-app-site-association`

This file must be served from `https://api.playlistmanager.com/.well-known/apple-app-site-association`

### Setup Instructions:

1. Replace `TEAM_ID` in the file with your Apple Developer Team ID
2. The file must be served with Content-Type: `application/json`
3. The file must be accessible without authentication
4. Test URL: https://api.playlistmanager.com/.well-known/apple-app-site-association

### Finding your Team ID:

- Log in to https://developer.apple.com/account
- Go to "Membership" section
- Copy your Team ID

## Android App Links

**File**: `assetlinks.json`

This file must be served from `https://api.playlistmanager.com/.well-known/assetlinks.json`

### Setup Instructions:

1. Generate your app's SHA-256 fingerprint:
   ```bash
   # For debug keystore
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

   # For release keystore
   keytool -list -v -keystore /path/to/release.keystore -alias your-alias
   ```

2. Replace `REPLACE_WITH_YOUR_APP_SHA256_FINGERPRINT` with your SHA-256 fingerprint
3. The file must be served with Content-Type: `application/json`
4. The file must be accessible without authentication
5. Test URL: https://api.playlistmanager.com/.well-known/assetlinks.json

### Verification:

Test your configuration at: https://developers.google.com/digital-asset-links/tools/generator

## Development / Localhost Testing

Both files include localhost configurations for development. For production:

1. Remove localhost entries from both files
2. Ensure your domain has a valid SSL certificate
3. Test the URLs are publicly accessible

## Mobile App Configuration

The mobile app is already configured in `apps/mobile/app.config.ts`:

- **iOS**: Associated domains are set to `api.playlistmanager.com`
- **Android**: Intent filters are configured for both `pm://` and `https://` schemes

## Deep Link Scheme

The app also supports the custom deep link scheme: `pm://`

Example: `pm://auth/callback?code=xyz&state=abc`

This works without internet connectivity and doesn't require domain verification.
