# GeoLite Mobile

A lightweight, QGIS-style mapping app for Android (not QGIS itself). Plain HTML/JS in `www/`, wrapped as an APK with Capacitor.

## Features
- **Open data**: GeoJSON, zipped Shapefile (.zip), CSV (lat/lon or x/y columns), KML, GPX, GeoTIFF (WGS84, Web Mercator or UTM, single or multi-band)
- **Map**: layer order, visibility, zoom, attribute table, popups, OSM basemap, export layer as GeoJSON, save/open project
- **Symbology**: single symbol, categorized, graduated (equal interval / quantile), color ramps, labels, raster color ramps and opacity
- **Layout**: A4/A3/Letter page, editable title and notes, legend, north arrow, scale bar, export PNG or Print/PDF
- **Geoprocessing** (Turf.js): buffer, clip, intersection, difference, union, dissolve, centroids, convex hull, bounding box, simplify, Voronoi, grid, points-in-polygon, count points, geometry attributes, extract by attribute
- **Python** (Pyodide): console with `layer_names()`, `get_layer(name)`, `add_layer(name, geojson)`, `zoom_to(name)`; optional numpy/pandas/shapely

## Build the APK without a PC (GitHub Actions)
1. Create a new GitHub repo and upload the contents of this folder (keep `.github/workflows/build-apk.yml`).
2. Open the repo's **Actions** tab, choose **Build APK**, tap **Run workflow**.
3. When it finishes, download the **GeoLite-debug-apk** artifact (a zip containing `app-debug.apk`), then install it. Allow "install unknown apps" if asked.

## Build locally
```bash
npm install
npm run vendor          # bundles JS libs into www/vendor for offline use
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
Needs Node 20+, JDK 17 and the Android SDK.

## Try it in a browser or install as a PWA
Serve `www/` over HTTPS (or `npx serve www`) and open it on your phone, then "Add to Home screen". Opening `index.html` directly from a file also works for testing.

## Limits
- Basemap tiles and the first Python load need internet. The JS libraries work offline once vendored into the APK.
- Rasters are downsampled to at most 1600 px on the long side, and drawn below vector layers.
- Raster CRS support: WGS84, Web Mercator, UTM. Reproject others first.
- Geoprocessing runs in the browser, so very large datasets will be slow.
- Layout PNG export uses html2canvas and can differ slightly from the on-screen map. Print/PDF may not work inside the Android WebView; use PNG there.
- The APK is a debug build. To publish it you must sign a release build.
