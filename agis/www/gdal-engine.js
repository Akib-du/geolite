import initGdalJs from 'gdal3.js';
import wasmUrl from 'gdal3.js/dist/package/gdal3WebAssembly.wasm?url';
import dataUrl from 'gdal3.js/dist/package/gdal3WebAssembly.data?url';
import { zipSync } from 'fflate';

let runtimePromise;
let runtimeLogs = [];

export function getGdalRuntime(onLog = () => {}) {
  if (!runtimePromise) {
    runtimePromise = initGdalJs({
      paths: { wasm: wasmUrl, data: dataUrl },
      useWorker: false,
      logHandler: (message, type) => {
        runtimeLogs.push({ message, type });
        if (runtimeLogs.length > 100) runtimeLogs.shift();
        onLog(message, type);
      },
      errorHandler: (message, type) => {
        runtimeLogs.push({ message, type: type || 'error' });
        if (runtimeLogs.length > 100) runtimeLogs.shift();
        onLog(message, type || 'error');
      }
    }).catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export async function getGdalDiagnostics() {
  const Gdal = await getGdalRuntime();
  const vectors = Object.entries(Gdal.drivers.vector).map(([name, driver]) => ({
    name, read: !!driver.isReadable, write: !!driver.isWritable
  }));
  const rasters = Object.entries(Gdal.drivers.raster).map(([name, driver]) => ({
    name, read: !!driver.isReadable, write: !!driver.isWritable
  }));
  const fgdb = Gdal.drivers.vector.OpenFileGDB;
  return {
    version: 'GDAL 3.8.x WebAssembly build',
    vectorDrivers: vectors.length,
    rasterDrivers: rasters.length,
    fileGdb: fgdb ? { available: true, read: !!fgdb.isReadable, write: !!fgdb.isWritable, driver: fgdb.longName } : { available: false, read: false, write: false },
    vectors,
    rasters,
    logs: [...runtimeLogs]
  };
}

function safeName(value) {
  return String(value || 'layer').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'layer';
}

function fileGdbRoot(files) {
  for (const file of files) {
    const rel = file.webkitRelativePath || file.name;
    const match = rel.match(/^(.*?\.gdb)(?:\/|$)/i);
    if (match) return match[1];
  }
  return null;
}

async function mountFileGdbFolder(Gdal, files, root) {
  const FS = Gdal.Module.FS;
  const prefix = root + '/';
  for (const file of files) {
    const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const index = rel.toLowerCase().indexOf(prefix.toLowerCase());
    if (index < 0) continue;
    const relative = rel.slice(index);
    const target = '/input/' + relative;
    const parent = target.slice(0, target.lastIndexOf('/'));
    FS.mkdirTree(parent);
    FS.writeFile(target, new Uint8Array(await file.arrayBuffer()));
  }
  return Gdal.open('/input/' + root);
}

async function openInput(Gdal, files) {
  const root = fileGdbRoot(files);
  if (root) return mountFileGdbFolder(Gdal, files, root);
  const ordered = [...files].sort((a, b) => {
    const rank = f => /\.shp$/i.test(f.name) ? 0 : /\.shx$/i.test(f.name) ? 1 : /\.dbf$/i.test(f.name) ? 2 : 3;
    return rank(a) - rank(b);
  });
  if (ordered.length === 1 && /\.zip$/i.test(ordered[0].name)) {
    return Gdal.open(ordered[0], [], ['vsizip']);
  }
  return Gdal.open(ordered);
}

function boundsFromInfo(info) {
  const corners = info?.corners || [];
  if (corners.length < 4) return null;
  const xs = corners.map(p => p[0]);
  const ys = corners.map(p => p[1]);
  const west = Math.min(...xs), east = Math.max(...xs);
  const south = Math.min(...ys), north = Math.max(...ys);
  if (![west, east, south, north].every(Number.isFinite) || west < -180.1 || east > 180.1 || south < -90.1 || north > 90.1) return null;
  return [[south, west], [north, east]];
}

async function vectorLayers(Gdal, dataset, info, sourceName) {
  const layerInfos = info.layers?.length ? info.layers : [{ name: sourceName, featureCount: info.featureCount || 0 }];
  const results = [];
  for (let i = 0; i < layerInfos.length; i++) {
    const layerInfo = layerInfos[i];
    const outName = safeName(sourceName + '_' + layerInfo.name + '_' + i);
    const options = ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326'];
    if (layerInfos.length > 1) {
      const sqlName = String(layerInfo.name).replace(/"/g, '""');
      options.push('-sql', 'SELECT * FROM "' + sqlName + '"');
    }
    const output = await Gdal.ogr2ogr(dataset, options, outName);
    const bytes = await Gdal.getFileBytes(output.local);
    const geojson = JSON.parse(new TextDecoder().decode(bytes));
    if (geojson?.type === 'FeatureCollection') {
      results.push({
        name: layerInfos.length > 1 ? layerInfo.name : sourceName.replace(/\.[^.]+$/, ''),
        type: 'vector',
        data: geojson,
        metadata: { driver: info.driverName, featureCount: geojson.features?.length || 0, source: sourceName }
      });
    }
  }
  return results;
}

async function rasterLayer(Gdal, dataset, info, sourceName) {
  const stem = safeName(sourceName.replace(/\.[^.]+$/, ''));
  const warpedPath = await Gdal.gdalwarp(dataset, ['-of', 'GTiff', '-t_srs', 'EPSG:4326'], stem + '_wgs84');
  const warpedDataset = (await Gdal.open(warpedPath.local)).datasets[0];
  if (!warpedDataset) throw new Error('GDAL could not reopen the reprojected raster.');
  try {
    const warpedInfo = await Gdal.getInfo(warpedDataset);
    const bounds = boundsFromInfo(warpedInfo);
    if (!bounds) throw new Error('Raster extent could not be transformed to geographic coordinates.');
    const pngPath = await Gdal.gdal_translate(warpedDataset, ['-of', 'PNG', '-scale'], stem + '_preview');
    const pngBytes = await Gdal.getFileBytes(pngPath.local);
    const imageUrl = URL.createObjectURL(new Blob([pngBytes], { type: 'image/png' }));
    return {
      name: sourceName,
      type: 'raster',
      data: { imageUrl, bounds, width: warpedInfo.width, height: warpedInfo.height },
      metadata: { driver: info.driverName, bands: info.bandCount, width: info.width, height: info.height, projection: 'EPSG:4326' }
    };
  } finally {
    await Gdal.close(warpedDataset);
  }
}

export async function loadWithGdal(files, onProgress = () => {}) {
  const Gdal = await getGdalRuntime();
  onProgress('GDAL initialized; opening source data…');
  const opened = await openInput(Gdal, [...files]);
  if (!opened.datasets?.length) {
    const errors = opened.errors || [];
    throw new Error(errors.map(e => e.message || String(e)).join('; ') || 'GDAL did not recognize the selected data.');
  }
  const output = [];
  try {
    for (let i = 0; i < opened.datasets.length; i++) {
      const dataset = opened.datasets[i];
      const info = await Gdal.getInfo(dataset);
      const sourceName = dataset.path || [...files][i]?.name || 'GIS dataset';
      onProgress('GDAL reading ' + sourceName + '…');
      if (info.type === 'raster') {
        output.push(await rasterLayer(Gdal, dataset, info, sourceName));
      } else {
        output.push(...await vectorLayers(Gdal, dataset, info, sourceName));
      }
    }
  } finally {
    for (const dataset of opened.datasets) {
      try { await Gdal.close(dataset); } catch {}
    }
  }
  return output;
}

export async function createFileGdbArchive(geojson, layerName = 'aGIS_layer') {
  const Gdal = await getGdalRuntime();
  const driver = Gdal.drivers.vector.OpenFileGDB;
  if (!driver?.isWritable) {
    throw new Error('This GDAL WebAssembly build does not advertise OpenFileGDB write support. The app will not claim FileGDB creation is available on this device.');
  }
  const name = safeName(layerName);
  const sourcePath = '/input/' + name + '_source.geojson';
  Gdal.Module.FS.writeFile(sourcePath, new TextEncoder().encode(JSON.stringify(geojson)));
  const source = (await Gdal.open(sourcePath)).datasets[0];
  if (!source) throw new Error('Could not prepare the GeoJSON source for FileGDB export.');
  try {
    const output = await Gdal.ogr2ogr(source, ['-f', 'OpenFileGDB'], name + '_FileGDB');
    const root = output.local;
    const files = await Gdal.getOutputFiles();
    const entries = {};
    for (const file of files) {
      if (!file.path.startsWith(root + '/')) continue;
      const relative = file.path.slice(root.length + 1);
      entries[name + '.gdb/' + relative] = await Gdal.getFileBytes(file.path);
    }
    if (!Object.keys(entries).length) throw new Error('GDAL created no FileGDB files.');
    return new Blob([zipSync(entries)], { type: 'application/zip' });
  } finally {
    await Gdal.close(source);
  }
}
