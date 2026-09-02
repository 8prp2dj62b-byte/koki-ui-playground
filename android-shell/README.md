# KOKI Android shell

Thin native Android shell for the live KOKI web application.

## v0.1 scope

- Loads `https://koki.tonyshodling.eu/koki-command-center` in a persistent WebView.
- Web UI and backend stay live and update without rebuilding the APK.
- Exposes the existing `window.kokiNfcIdCard` bridge used by Profile → Identity card (NFC).
- Detects Android NFC capability.
- Enables Android reader mode for NFC-A/NFC-B.
- Opens ISO-DEP and sends an ICAO/eMRTD application SELECT for AID `A0000002471001`.
- Returns diagnostic result/status word to the existing KOKI web callbacks.
- Does not request DG3/DG4 or fingerprints.

## Security boundaries

- Only the KOKI HTTPS host stays inside the WebView; top-level external navigation is opened in the system browser.
- Cleartext traffic, file access, content access, geolocation and third-party cookies are disabled.
- The native JavaScript bridge exposes only NFC capability and identity-card scan entry points.

## Next native step

After the first real Bulgarian ID-card tap confirms the chip/access-control behavior, add PACE/BAC and DG1/DG2 reading plus passive authentication while preserving the same web bridge contract.

## Build

GitHub Actions produces a debug APK artifact from `.github/workflows/build-koki-android.yml`.
