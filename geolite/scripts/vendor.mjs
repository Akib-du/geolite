// Copies JS libraries from node_modules into www/vendor so the APK works offline
// (map tiles and the Python runtime still need internet).
import { cpSync, mkdirSync, existsSync } from 'node:fs';

const files = [
  ['leaflet/dist/leaflet.js', 'leaflet.js'],
  ['leaflet/dist/leaflet.css', 'leaflet.css'],
  ['leaflet/dist/images', 'images'],
  ['@turf/turf/turf.min.js', 'turf.min.js'],
  ['geotiff/dist-browser/geotiff.js', 'geotiff.js'],
  ['shpjs/dist/shp.min.js', 'shp.min.js'],
  ['@tmcw/togeojson/dist/togeojson.umd.js', 'togeojson.umd.js'],
  ['html2canvas/dist/html2canvas.min.js', 'html2canvas.min.js'],
];

mkdirSync('www/vendor', { recursive: true });
for (const [src, dest] of files) {
  const from = `node_modules/${src}`;
  if (!existsSync(from)) { console.warn('missing (CDN fallback will be used):', from); continue; }
  cpSync(from, `www/vendor/${dest}`, { recursive: true });
  console.log('vendored', dest);
}
