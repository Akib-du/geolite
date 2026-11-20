import { fromBlob, writeArrayBuffer } from 'geotiff';
import { getGdalRuntime } from './gdal-engine.js';

const safe = value => String(value || 'raster_output').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48);
const noDataValue = -9999;

async function openRaster(file) {
  const tiff = await fromBlob(file);
  const image = await tiff.getImage();
  if (image.getSamplesPerPixel() < 1) throw new Error('No raster band was found.');
  return { tiff, image };
}

function geoMetadata(image) {
  const fd = image.fileDirectory || {};
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const keys = image.getGeoKeys?.() || {};
  const metadata = {
    width: image.getWidth(),
    height: image.getHeight(),
    ModelPixelScale: [Math.abs(resolution[0]), Math.abs(resolution[1]), 0],
    ModelTiepoint: [0, 0, 0, origin[0], origin[1], origin[2] || 0],
    BitsPerSample: 32,
    SampleFormat: 3,
    SamplesPerPixel: 1,
    Compression: 1,
    PlanarConfiguration: 1
  };
  for (const [key, value] of Object.entries(keys)) {
    if (typeof value === 'number' && Number.isFinite(value)) metadata[key] = value;
  }
  if (fd.GeoKeyDirectory) metadata.GeoKeyDirectory = fd.GeoKeyDirectory;
  if (fd.GeoAsciiParams) metadata.GeoAsciiParams = fd.GeoAsciiParams;
  return metadata;
}

async function writeFloatRaster(values, image, name) {
  const metadata = geoMetadata(image);
  const bytes = await writeArrayBuffer(new Float32Array(values), metadata);
  return { blob: new Blob([bytes], { type: 'image/tiff' }), name: safe(name) + '.tif', width: metadata.width, height: metadata.height };
}

function tokenize(expression) {
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g) || [];
  if (tokens.join('') !== expression.replace(/\s+/g, '')) throw new Error('Expression contains unsupported characters.');
  return tokens;
}
function compileExpression(expression, names) {
  const tokens = tokenize(expression);
  let p = 0;
  const primary = () => {
    const t = tokens[p++];
    if (t === '(') { const node = add(); if (tokens[p++] !== ')') throw new Error('Missing closing parenthesis.'); return node; }
    if (t === '-') { const n = primary(); return a => -n(a); }
    if (t === '+') return primary();
    if (t === undefined) throw new Error('Unexpected end of expression.');
    if (/^(?:\d|\.)/.test(t)) { const n = Number(t); return () => n; }
    if (!names.includes(t)) throw new Error('Unknown raster variable: ' + t);
    return i => i[t];
  };
  const mul = () => { let left = primary(); while (tokens[p] === '*' || tokens[p] === '/') { const op = tokens[p++], right = primary(); const old = left; left = i => op === '*' ? old(i) * right(i) : old(i) / right(i); } return left; };
  const add = () => { let left = mul(); while (tokens[p] === '+' || tokens[p] === '-') { const op = tokens[p++], right = mul(); const old = left; left = i => op === '+' ? old(i) + right(i) : old(i) - right(i); } return left; };
  const fn = add();
  if (p !== tokens.length) throw new Error('Unexpected token: ' + tokens[p]);
  return fn;
}

async function calculate(files, expression, name, onProgress) {
  if (!files?.length) throw new Error('Choose at least one GeoTIFF input.');
  const opened = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const { image } = await openRaster(files[i]);
      opened.push(image);
    }
    const first = opened[0], width = first.getWidth(), height = first.getHeight();
    if (width * height > 16000000) throw new Error('This calculator currently limits a single operation to 16 million cells to protect Android memory. Clip or resample the inputs first.');
    const arrays = [];
    const variables = files.map((f, i) => String.fromCharCode(65 + i));
    for (let i = 0; i < opened.length; i++) {
      const im = opened[i];
      if (im.getWidth() !== width || im.getHeight() !== height) throw new Error('Raster dimensions do not match. Align all inputs to the same grid first.');
      const r = im.getResolution(), o = im.getOrigin(), r0 = first.getResolution(), o0 = first.getOrigin();
      if (Math.abs(r[0]-r0[0])>1e-9 || Math.abs(r[1]-r0[1])>1e-9 || Math.abs(o[0]-o0[0])>1e-7 || Math.abs(o[1]-o0[1])>1e-7) throw new Error('Raster grids do not align. Match CRS, cell size and origin before calculation.');
      arrays.push((await im.readRasters({ interleave: false }))[0]);
    }
    const fn = compileExpression(expression, variables);
    const out = new Float32Array(width * height);
    const rowStep = Math.max(1, Math.floor(height / 50));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixel = Object.fromEntries(variables.map((v, i) => [v, arrays[i][idx]]));
        const value = fn(pixel);
        out[idx] = Number.isFinite(value) ? value : noDataValue;
      }
      if (y % rowStep === 0) onProgress?.('Raster Calculator: ' + Math.round(y / height * 100) + '%');
    }
    return writeFloatRaster(out, first, name);
  } finally { /* GeoTIFF readers release their buffers when references are collected. */ }
}

async function reclassify(file, rules, name, onProgress) {
  const { image } = await openRaster(file);
  const width = image.getWidth(), height = image.getHeight();
  if (width * height > 20000000) throw new Error('Reclassification is limited to 20 million cells per run on mobile. Resample or clip first.');
  const src = (await image.readRasters({ interleave: false }))[0];
  const out = new Float32Array(src.length);
  const parsed = rules.split(/[\n;]+/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[,:\s]+/).map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) throw new Error('Each reclass rule must be: minimum maximum new_value');
    if (parts[0] > parts[1]) throw new Error('A reclass minimum exceeds its maximum.');
    return parts;
  });
  if (!parsed.length) throw new Error('Enter at least one reclass rule.');
  for (let i = 0; i < src.length; i++) {
    const v = Number(src[i]);
    const rule = parsed.find(([min, max]) => v >= min && v <= max);
    out[i] = Number.isFinite(v) && rule ? rule[2] : noDataValue;
    if (i % Math.max(1, Math.floor(src.length / 50)) === 0) onProgress?.('Reclassifying: ' + Math.round(i / src.length * 100) + '%');
  }
  return writeFloatRaster(out, image, name);
}

async function terrain(file, kind, name, onProgress) {
  const { image } = await openRaster(file);
  const width = image.getWidth(), height = image.getHeight();
  if (width * height > 12000000) throw new Error('Terrain derivatives are limited to 12 million cells on this mobile build. Clip/resample your DEM first.');
  const src = (await image.readRasters({ interleave: false }))[0];
  const res = image.getResolution();
  const px = Math.abs(res[0]), py = Math.abs(res[1]);
  const geoKeys = image.getGeoKeys?.() || {};
  const geographic = !!geoKeys.GeographicTypeGeoKey;
  const lat = image.getOrigin()[1] * Math.PI / 180;
  const xScale = geographic ? 111320 * Math.cos(lat) : 1;
  const yScale = geographic ? 110574 : 1;
  const dx = px * xScale, dy = py * yScale;
  const out = new Float32Array(src.length);
  out.fill(noDataValue);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const z1=src[i-width-1], z2=src[i-width], z3=src[i-width+1], z4=src[i-1], z6=src[i+1], z7=src[i+width-1], z8=src[i+width], z9=src[i+width+1];
      if (![z1,z2,z3,z4,z6,z7,z8,z9].every(Number.isFinite)) continue;
      const gx=((z3+2*z6+z9)-(z1+2*z4+z7))/(8*dx);
      const gy=((z7+2*z8+z9)-(z1+2*z2+z3))/(8*dy);
      const slope=Math.atan(Math.hypot(gx,gy));
      if (kind === 'slope') out[i]=slope*180/Math.PI;
      else if (kind === 'aspect') out[i]=(Math.atan2(-gx,gy)*180/Math.PI+360)%360;
      else {
        const az=315*Math.PI/180, alt=45*Math.PI/180;
        const zenith=Math.PI/2-slope;
        const azimuth=Math.atan2(-gx,gy);
        const shade= Math.cos(zenith)*Math.cos(alt)+Math.sin(zenith)*Math.sin(alt)*Math.cos(az-azimuth);
        out[i]=Math.max(0,Math.min(255,Math.round(255*shade)));
      }
    }
    if (y % Math.max(1, Math.floor(height/50))===0) onProgress?.('Terrain processing: '+Math.round(y/height*100)+'%');
  }
  return writeFloatRaster(out,image,name);
}

async function gdalWarp(file, options, name) {
  const Gdal = await getGdalRuntime();
  const opened = await Gdal.open(file);
  if (!opened.datasets?.length) throw new Error(opened.errors?.map(e=>e.message||String(e)).join('; ') || 'GDAL could not open the input raster.');
  try {
    const result = await Gdal.gdalwarp(opened.datasets[0], ['-of','GTiff','-co','COMPRESS=LZW','-co','TILED=YES',...options], safe(name));
    const bytes = await Gdal.getFileBytes(result.local);
    return { blob: new Blob([bytes],{type:'image/tiff'}), name:safe(name)+'.tif' };
  } finally { for (const ds of opened.datasets) try { await Gdal.close(ds); } catch {} }
}


async function hydrology(file, kind, params, name, onProgress) {
  const {image}=await openRaster(file);
  const width=image.getWidth(),height=image.getHeight(),count=width*height;
  if(count>8500000) throw new Error('D8 hydrology is limited to 8.5 million cells on this mobile build. Clip the DEM or resample it before processing.');
  const src=(await image.readRasters({interleave:false}))[0];
  const res=image.getResolution(),px=Math.abs(res[0]),py=Math.abs(res[1]);
  const keys=image.getGeoKeys?.()||{}, geographic=!!keys.GeographicTypeGeoKey;
  const lat=image.getOrigin()[1]*Math.PI/180;
  const dx=px*(geographic?111320*Math.cos(lat):1),dy=py*(geographic?110574:1);
  const gtNoData=Number(image.fileDirectory?.GDAL_NODATA);
  const valid=v=>Number.isFinite(v)&&(!Number.isFinite(gtNoData)||v!==gtNoData);
  const dirs=[{dx:1,dy:0,code:1},{dx:1,dy:1,code:2},{dx:0,dy:1,code:4},{dx:-1,dy:1,code:8},{dx:-1,dy:0,code:16},{dx:-1,dy:-1,code:32},{dx:0,dy:-1,code:64},{dx:1,dy:-1,code:128}];
  const flow=new Float32Array(count);flow.fill(noDataValue);const down=new Int32Array(count);down.fill(-1);
  const indegree=new Uint8Array(count);
  const slope=new Float32Array(count);slope.fill(noDataValue);
  for(let y=1;y<height-1;y++){
    for(let x=1;x<width-1;x++){
      const i=y*width+x,z=src[i];if(!valid(z))continue;flow[i]=0;
      const z1=src[i-width-1],z2=src[i-width],z3=src[i-width+1],z4=src[i-1],z6=src[i+1],z7=src[i+width-1],z8=src[i+width],z9=src[i+width+1];
      if(![z1,z2,z3,z4,z6,z7,z8,z9].every(valid))continue;
      const gx=((z3+2*z6+z9)-(z1+2*z4+z7))/(8*dx),gy=((z7+2*z8+z9)-(z1+2*z2+z3))/(8*dy);
      slope[i]=Math.atan(Math.hypot(gx,gy));
      let best=0,bestDrop=0,bestIndex=-1;
      for(const d of dirs){
        const nx=x+d.dx,ny=y+d.dy,nidx=ny*width+nx,nz=src[nidx];
        if(!valid(nz))continue;
        const distance=Math.hypot(d.dx*dx,d.dy*dy),drop=(z-nz)/distance;
        if(drop>bestDrop){bestDrop=drop;best=d.code;bestIndex=nidx;}
      }
      if(bestIndex>=0){flow[i]=best;down[i]=bestIndex;indegree[bestIndex]++;}
    }
    if(y%Math.max(1,Math.floor(height/30))===0)onProgress?.('D8 direction: '+Math.round(y/height*100)+'%');
  }
  if(kind==='flowdir')return writeFloatRaster(new Float32Array(flow),image,name);
  const accumulation=new Float32Array(count);accumulation.fill(noDataValue);for(let i=0;i<count;i++)if(valid(src[i]))accumulation[i]=0;const queue=new Uint32Array(count);
  let head=0,tail=0;
  for(let i=0;i<count;i++)if(valid(src[i])&&indegree[i]===0)queue[tail++]=i;
  while(head<tail){
    const i=queue[head++],to=down[i];
    if(to>=0){
      accumulation[to]+=accumulation[i]+1;
      indegree[to]--;
      if(indegree[to]===0)queue[tail++]=to;
    }
    if(head%Math.max(1,Math.floor(count/30))===0)onProgress?.('Flow accumulation: '+Math.round(head/Math.max(1,tail)*100)+'%');
  }
  if(kind==='flowacc')return writeFloatRaster(accumulation,image,name);
  if(kind==='stream'){
    const threshold=Number(params.threshold||100);
    if(!(threshold>0))throw new Error('Stream threshold must be greater than zero.');
    const out=new Float32Array(count);
    for(let i=0;i<count;i++)out[i]=valid(src[i])?(accumulation[i]>=threshold?1:0):noDataValue;
    return writeFloatRaster(out,image,name);
  }
  if(kind==='twi'){
    const out=new Float32Array(count);
    for(let i=0;i<count;i++){
      const tan=Math.tan(slope[i]),area=(accumulation[i]+1)*Math.sqrt(dx*dy);
      out[i]=valid(src[i])&&Number.isFinite(tan)&&tan>0?Math.log(area/tan):noDataValue;
    }
    return writeFloatRaster(out,image,name);
  }
  throw new Error('Unknown hydrology operation.');
}

export const rasterTools = [
  {id:'clip',name:'Clip Raster',group:'Preparation',description:'Clip to a coordinate extent.'},
  {id:'mask',name:'Extract by Mask',group:'Preparation',description:'Clip using a vector polygon mask.'},
  {id:'reproject',name:'Project Raster',group:'Preparation',description:'Reproject to a target EPSG CRS.'},
  {id:'resample',name:'Resample Raster',group:'Preparation',description:'Change pixel size and resampling method.'},
  {id:'align',name:'Align Raster Grid',group:'Preparation',description:'Set target CRS and cell size with aligned pixels.'},
  {id:'calculator',name:'Raster Calculator',group:'Analysis',description:'Cell-by-cell arithmetic across aligned rasters.'},
  {id:'reclass',name:'Reclassify',group:'Analysis',description:'Convert value ranges to class values.'},
  {id:'slope',name:'Slope',group:'Terrain',description:'Calculate slope in degrees from a DEM.'},
  {id:'aspect',name:'Aspect',group:'Terrain',description:'Calculate aspect in degrees from a DEM.'},
  {id:'hillshade',name:'Hillshade',group:'Terrain',description:'Calculate analytical hillshade from a DEM.'},
  {id:'flowdir',name:'D8 Flow Direction',group:'Hydrology',description:'Route each valid cell to its steepest lower neighbour.'},
  {id:'flowacc',name:'D8 Flow Accumulation',group:'Hydrology',description:'Count upstream contributing cells using D8 routing.'},
  {id:'stream',name:'Stream Extraction',group:'Hydrology',description:'Extract cells above a flow accumulation threshold.'},
  {id:'twi',name:'Topographic Wetness Index',group:'Hydrology',description:'Compute ln(contributing area / tan(slope)).'},
  {id:'info',name:'Raster Information',group:'Utilities',description:'Inspect raster dimensions, bounds, resolution and CRS.'}
];

export async function runRasterTool({tool,files,params={},onProgress=()=>{}}) {
  const file = files?.[0];
  if (!file) throw new Error('Select an input GeoTIFF raster first.');
  const name = safe(params.outputName || tool + '_output');
  if (tool === 'calculator') return calculate(files,params.expression || '',name,onProgress);
  if (tool === 'reclass') return reclassify(file,params.rules || '',name,onProgress);
  if (['slope','aspect','hillshade'].includes(tool)) return terrain(file,tool,name,onProgress);
  if (['flowdir','flowacc','stream','twi'].includes(tool)) return hydrology(file,tool,params,name,onProgress);
  if (tool === 'info') {
    const {image}=await openRaster(file);
    const g=image.getGeoKeys?.()||{};
    return {info:true,text:'Size: '+image.getWidth()+' × '+image.getHeight()+' px\nBands: '+image.getSamplesPerPixel()+'\nOrigin: '+image.getOrigin().join(', ')+'\nResolution: '+image.getResolution().join(', ')+'\nBounds: '+image.getBoundingBox().join(', ')+'\nEPSG: '+(g.ProjectedCSTypeGeoKey||g.GeographicTypeGeoKey||'not identified')};
  }
  const opts=[];
  if (tool==='clip') {
    const v=(params.extent||'').split(/[ ,]+/).map(Number);
    if(v.length!==4||!v.every(Number.isFinite)||v[0]>=v[2]||v[1]>=v[3]) throw new Error('Extent must be xmin ymin xmax ymax in the input raster CRS.');
    opts.push('-te',...v.map(String));
    if(params.extentCrs) opts.push('-te_srs',params.extentCrs);
  } else if (tool==='mask') {
    if(!params.maskGeoJSON) throw new Error('Choose a polygon mask layer in the map before running Extract by Mask.');
    const Gdal=await getGdalRuntime();
    const path='/input/agis_mask.geojson';
    Gdal.Module.FS.writeFile(path,new TextEncoder().encode(JSON.stringify(params.maskGeoJSON)));
    opts.push('-cutline',path,'-crop_to_cutline');
  } else if (tool==='reproject') {
    if(!/^EPSG:\d+$/i.test(params.epsg||'')) throw new Error('Enter a valid EPSG code, for example EPSG:32646.');
    opts.push('-t_srs',params.epsg.toUpperCase());
  } else if (tool==='resample') {
    const x=Number(params.cellX),y=Number(params.cellY);
    if(!(x>0&&y>0)) throw new Error('Enter positive X and Y cell sizes.');
    opts.push('-tr',String(x),String(y),'-r',params.method||'near');
  } else if (tool==='align') {
    if(!params.referenceFile) throw new Error('Choose a reference raster to define the target grid.');
    const Gdal=await getGdalRuntime();
    const refOpen=await Gdal.open(params.referenceFile);
    const ref=refOpen.datasets?.[0];
    if(!ref) throw new Error('Could not open the reference raster.');
    try {
      const info=await Gdal.getInfo(ref),gt=info.coordinateTransform;
      if(!gt||Math.abs(gt[2])>1e-9||Math.abs(gt[4])>1e-9) throw new Error('Rotated reference grids are not supported by this alignment tool yet.');
      const xmin=gt[0],xmax=gt[0]+gt[1]*info.width,ymax=gt[3],ymin=gt[3]+gt[5]*info.height;
      opts.push('-t_srs',info.projectionWkt,'-te',String(Math.min(xmin,xmax)),String(Math.min(ymin,ymax)),String(Math.max(xmin,xmax)),String(Math.max(ymin,ymax)),'-tr',String(Math.abs(gt[1])),String(Math.abs(gt[5])),'-r',params.method||'near');
    } finally { try { await Gdal.close(ref); } catch {} }
  } else throw new Error('This raster tool is not yet connected to the processing engine.');
  const output=await gdalWarp(file,opts,name);
  return output;
}

export async function exportRasterToFileGdb(tiffBlob, name) {
  const Gdal=await getGdalRuntime();
  const driver=Gdal.drivers.raster.OpenFileGDB;
  if(!driver?.isWritable) throw new Error('This GDAL build does not advertise OpenFileGDB raster write support. GeoTIFF output is available; FileGDB raster output is not verified on this runtime.');
  const path='/input/'+safe(name)+'.tif';
  Gdal.Module.FS.writeFile(path,new Uint8Array(await tiffBlob.arrayBuffer()));
  const ds=(await Gdal.open(path)).datasets[0];
  if(!ds) throw new Error('Could not reopen generated GeoTIFF for FileGDB export.');
  try {
    const out=await Gdal.gdal_translate(ds,['-of','OpenFileGDB'],safe(name)+'_FileGDB');
    const files=await Gdal.getOutputFiles();
    const entries={};
    const {zipSync}=await import('fflate');
    for(const f of files) if(f.path.startsWith(out.local+'/')) entries[safe(name)+'.gdb/'+f.path.slice(out.local.length+1)]=await Gdal.getFileBytes(f.path);
    if(!Object.keys(entries).length) throw new Error('The OpenFileGDB raster driver produced no files.');
    return new Blob([zipSync(entries)],{type:'application/zip'});
  } finally { try { await Gdal.close(ds); } catch {} }
}
