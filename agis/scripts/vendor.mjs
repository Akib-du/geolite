import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('node_modules');const out=path.resolve('www/vendor');fs.mkdirSync(out,{recursive:true});
for(const [src,dst] of [['leaflet/dist/leaflet.css','leaflet.css'],['leaflet/dist/leaflet.js','leaflet.js'],['leaflet/dist/images','images']]){const a=path.join(root,src),b=path.join(out,dst);if(fs.existsSync(a)){fs.cpSync(a,b,{recursive:true});}}
console.log('Vendor assets copied');
