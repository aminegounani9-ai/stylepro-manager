# StylePro Manager — Mobile

Native React Native / Expo app shared by Android and iOS.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set the Supabase project URL and **publishable/anon key**. Never use a service-role key in a mobile app.
3. From this directory run:

```bash
npm ci
npx expo start
```

## Android and iOS builds

Install EAS CLI and authenticate:

```bash
npm install --global eas-cli
eas login
eas build:configure
```

Build Android:
```bash
eas build --platform android --profile preview
```

Build iOS:
```bash
eas build --platform ios --profile preview
```

For App Store distribution, use the production profile and configure the Apple Developer credentials in EAS. An iOS build requires Apple signing credentials; it cannot be produced as an installable iPhone app directly from a Windows/Android device.

## Current scope

The native app currently includes authentication, store selection, dashboard KPIs, catalogue browsing and camera barcode/QR lookup. Other desktop modules are not yet implemented natively. They must be added and tested module-by-module before describing the mobile app as feature-complete.
