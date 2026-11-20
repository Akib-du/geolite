# GeoLite Mobile APK build

This branch contains a GitHub Actions workflow for the uploaded GeoLite Mobile Capacitor project.

## Add the project source archive

Upload the original ZIP as `GeoLite-project-source.zip` in the repository root on this branch. The archive should contain:

`GeoLite-project/geolite/package.json`

Pushing that file to this branch automatically starts **Build GeoLite Mobile APK**. You can also run it manually from Actions.

## Download the APK

When the workflow succeeds, open the run and download the `GeoLite-debug-apk` artifact. It contains `app-debug.apk`.

This is a debug APK for testing, not a signed Play Store release.
