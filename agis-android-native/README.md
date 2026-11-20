# aGIS Native Android (GDAL/JNI proof build)

This isolated Android project sits alongside the existing web application. It does not replace `main` or the web app.

## What this build proves
- Android APK packaging for `arm64-v8a`.
- Native C++17 JNI library linked against GDAL built for Android with the Android NDK.
- Runtime GDAL version and registered driver discovery from native code.
- No Python, Chaquopy, or Python runtime is included.

## Important scope
This is the native GDAL engine/build foundation, **not yet the full migration of the uploaded Kotlin GIS interface**. The original app calls Python for vector/raster loading, feature editing, and geoprocessing. Those operations must be ported to JNI one by one before the full aGIS feature set can be called Python-free. This APK is a native-engine proof build, not a replacement for the complete GIS app.
