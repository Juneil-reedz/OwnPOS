# OwnPOS

A point-of-sale app for Philippine carinderias, restaurants, cafés, milk tea shops and food stalls.
Each store's sales, menu and brand are saved only on its own device. No shared data.

- 30-day free trial, then ₱500/month (₱1,500 for 3 months, ₱5,000 for a year)
- Works offline. Renewal reminders are worked out on the device from a signed license.
- Each store can change its colours, font, logo and receipt.
- Digital receipts with a QR code and a verification code.
- Feedback and update checks inside the app, and a **?** on every section explaining it.
- Admin dashboard (free, in your Google account): stores, payments to approve, feedback, licenses. See [server/SETUP.md](server/SETUP.md).

## Install on Android

Open the [latest release](../../releases/latest) on the tablet or phone, download the `.apk` file, open it and tap **Install**.
If Android asks, allow installing apps from your browser.

## How licenses work

The app holds only the public key (`license-public-key.json`). Licenses are signed with the private key,
which is **never** stored in this repository. A license is tied to one device ID and an end date.

## Publish an update

1. Make your changes and push to `main`. Every push builds a test APK (Actions → the run → Artifacts).
2. To release: **Actions → Build Android app → Run workflow**, enter the new version (e.g. `1.0.1`) and what's new.
3. Stores see **Update to 1.0.1** in the app the next time they're online.

## Repository secrets (Settings → Secrets and variables → Actions)

| Name | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The signing key, base64. Keep the same one forever, or updates won't install. |
| `ANDROID_KEYSTORE_PASSWORD` | Its password |

Variables (same page, **Variables** tab):

| Name | What it is |
|---|---|
| `OWNPOS_SERVER_URL` | Your OwnPOS Server web app URL. Turns on the admin dashboard, automatic feedback and automatic license delivery. See [server/SETUP.md](server/SETUP.md). |
| `GCASH_NAME`, `GCASH_NUMBER` | Optional. Override the GCash details shown on the renewal screen. |

## Develop

```
npm ci
npm run sync          # builds www/ and copies it into the Android project
npx cap open android  # opens Android Studio
```
