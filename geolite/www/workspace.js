/* GeoLite Pro-inspired workspace shell and editing tools */
(()=>{
 const waitFor=fn=>{if(fn())return;const t=setInterval(()=>{if(fn())clearInterval(t)},150);setTimeout(()=>clearInterval(t),20000)};
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 function boot(){
  if(typeof S==='undefined'||typeof map==='undefined'||!map||!$('#view-map'))return false;
  if($('#gp-ribbon'))return true;
  const main=$('#main'),view=$('#view-map');
  const ribbon=document.createElement('div');ribbon.id='gp-ribbon';
  ribbon.innerHTML='<div id="gp-ribbon-tabs"><button class="gp-rib-tab active" data-rib="map">Map</button><button class="gp-rib-tab" data-rib="edit">Edit</button><button class="gp-rib-tab" data-rib="insert">Insert</button><button class="gp-rib-tab" data-rib="view">View</button><button class="gp-rib-tab" data-rib="analysis">Analysis</button></div><div id="gp-ribbon-tools"></div>';
  main.parentNode.insertBefore(ribbon,main);
  const editbar=document.createElement('div');editbar.id='gp-editbar';main.parentNode.insertBefore(editbar,main);
  const catalog=document.createElement('aside');catalog.id='gp-catalog';catalog.innerHTML='<div class="gp-pane-head"><span>Catalog</span><button id="gp-refresh">↻</button></div><div class="gp-pane-body" id="gp-catalog-body"></div>';
  view.insertBefore(catalog,$('#side',view).nextSibling);
  const contents=document.createElement('aside');contents.id='gp-contents';contents.innerHTML='<div class="gp-pane-head"><span>Contents</span><button id="gp-open-table">▦ Table</button></div><div class="gp-pane-body" id="gp-contents-body"></div>';
  view.appendChild(contents);
  const dock=document.createElement('section');dock.id='gp-attr-dock';dock.innerHTML='<div id="gp-attr-head"><strong id="gp-attr-title">Attribute table</strong><div id="gp-attr-tabs"><button data-atab="records" class="active">Records</button><button data-atab="fields">Fields</button></div><button id="gp-add-field">+ Field</button><button id="gp-save-table" class="pri">Save</button><button id="gp-close-table">×</button></div><div id="gp-attr-scroll"></div>';
  main.parentNode.insertBefore(dock,main.nextSibling);
  const status=document.createElement('div');status.id='gp-status';status.innerHTML='<span id="gp-status-project">Project: Untitled</span><span id="gp-status-layers">0 layers</span><span id="gp-status-selection">No selection</span><span style="margin-left:auto">GeoLite Pro Workspace</span>';
  dock.parentNode.insertBefore(status,dock.nextSibling);
  $('#tabs').style.display='none';
  let activeId=null,selected=null,editing=false,attrTab='records',activeRibbon='map',selectedTree='map';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId=id=>S.layers.find(l=>l.id===id);
  const layerName=l=>l.name||'Untitled layer';
  const active=()=>byId(activeId)||S.layers.find(l=>l.type==='vector')||S.layers[0];
  const notify=m=>{if(typeof toast==='function')toast(m)};
  function button(icon,label,action,cls=''){return '<button class="gp-tool '+cls+'" data-action="'+action+'"><span class="gp-ico">'+icon+'</span><span>'+label+'</span></button>'}
  const groups={
   map:[['Project',button('＋','Add data','open')+button('▦','FileGDB','gdb')+button('⌖','GPS','gps','primary')],['Navigate',button('⌖','Full extent','extent')+button('▤','Basemap','basemap')],['Map',button('▦','Attribute table','table')+button('▣','Catalog','catalog')]],
   edit:[['Features',button('＋','Create','create','primary')+button('✥','Select','select')+button('⌫','Delete','delete')],['Editing',button('✓','Save edits','save','primary')+button('↶','Discard','discard')],['Attributes',button('▦','Open table','table')+button('＋','Add field','addfield')]],
   insert:[['Map elements',button('T','Text','text')+button('▤','Legend','legend')+button('↑','North arrow','north')+button('━','Scale bar','scale')],['Media',button('▧','Picture','picture')+button('▣','Map frame','mapframe')]],
   view:[['Panels',button('▤','Catalog','catalog')+button('▤','Contents','contents')+button('▦','Table','table')],['Basemap',button('▧','Street','street')+button('▧','Satellite','satellite')]],
   analysis:[['Tools',button('⚙','Geoprocessing','tools')+button('⌘','Python','python')+button('▧','Layout view','layout')]]
  };
  function setRibbon(name){activeRibbon=name;$$('.gp-rib-tab').forEach(b=>b.classList.toggle('active',b.dataset.rib===name));$('#gp-ribbon-tools').innerHTML=(groups[name]||groups.map).map(g=>'<div class="gp-group"><div style="display:flex;gap:4px">'+g[1]+'</div><small style="align-self:end;color:#77838c">'+g[0]+'</small></div>').join('');$$('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));renderEditbar()}
  function renderEditbar(){editbar.innerHTML='<strong style="font-size:11px;margin-right:4px">Edit tools</strong><button data-e="toggle" class="'+(editing?'active':'')+'">'+(editing?'Editing ON':'Enable editing')+'</button><button data-e="select" class="'+(selected?'active':'')+'">Select feature</button><button data-e="create">Create feature</button><button data-e="delete">Delete selected</button><span class="gp-sep"></span><span style="font-size:11px;color:#61707b">'+(selected?'1 feature selected':'No feature selected')+'</span>';$$('[data-e]',editbar).forEach(b=>b.onclick=()=>{const a=b.dataset.e;if(a==='toggle'){editing=!editing;notify(editing?'Editing enabled':'Editing disabled')}else action(a);renderEditbar()})}
  function renderCatalog(){
   const body=$('#gp-catalog-body');
   body.innerHTML='<div class="gp-tree-row selected" data-tree="project"><span>▣</span><span class="gp-name"><b>Project</b></span></div><div class="gp-tree-indent"><div class="gp-tree-row" data-tree="maps"><span>▱</span><span class="gp-name">Maps</span></div><div class="gp-tree-row" data-tree="folders"><span>▰</span><span class="gp-name">Folders</span></div><div class="gp-tree-row" data-tree="databases"><span>▦</span><span class="gp-name">Databases</span></div><div class="gp-tree-row" data-tree="toolboxes"><span>⚙</span><span class="gp-name">Toolboxes</span></div></div><div class="gp-section-label">Open datasets</div>'+S.layers.map(l=>'<div class="gp-tree-row gp-tree-indent '+(activeId===l.id?'selected':'')+'" data-catalog-layer="'+l.id+'"><span>'+(l.type==='raster'?'▧':'◇')+'</span><span class="gp-name">'+esc(layerName(l))+'</span><small>'+(l.type==='raster'?'Raster':'Vector')+'</small></div>').join('')+'<div class="gp-layer-actions"><button id="gp-catalog-add">＋ Add data</button><button id="gp-catalog-gdb">FileGDB</button></div>';
   $$('[data-catalog-layer]',body).forEach(r=>r.onclick=()=>{activeId=+r.dataset.catalogLayer;const l=active();if(l)zoomTo(l);renderCatalog();renderContents()});
   $('#gp-catalog-add').onclick=()=>$('#btn-open').click();$('#gp-catalog-gdb').onclick=()=>$('#btn-gdb').click();
   $$('[data-tree]',body).forEach(r=>r.onclick=()=>{$$('[data-tree]',body).forEach(x=>x.classList.remove('selected'));r.classList.add('selected');selectedTree=r.dataset.tree});
  }
  function renderContents(){
   const body=$('#gp-contents-body');
   body.innerHTML='<div class="gp-section-label">Drawing order</div>'+[...S.layers].map(l=>'<div class="gp-layer-row '+(activeId===l.id?'selected':'')+'"><input type="checkbox" data-visible="'+l.id+'" '+(l.visible?'checked':'')+'><span class="gp-swatch" style="background:'+(l.type==='raster'?'#8fa7b4':(l.style?.fill||l.style?.stroke||'#6b9b7d'))+'"></span><span class="gp-name" data-layer-select="'+l.id+'">'+esc(layerName(l))+'</span><button data-layer-menu="'+l.id+'" title="Layer options">⋯</button></div>').join('')+'<div class="gp-layer-actions"><button id="gp-table-bottom">Open attribute table</button><button id="gp-remove-layer">Remove layer</button></div>';
   $$('[data-visible]',body).forEach(c=>c.onchange=()=>{const l=byId(+c.dataset.visible);if(l){l.visible=c.checked;afterChange();renderContents()}});
   $$('[data-layer-select]',body).forEach(n=>n.onclick=()=>{activeId=+n.dataset.layerSelect;renderContents();renderCatalog()});
   $$('[data-layer-menu]',body).forEach(n=>n.onclick=()=>{activeId=+n.dataset.layerMenu;layerMenu()});
   $('#gp-table-bottom').onclick=openTable;
   $('#gp-remove-layer').onclick=()=>{const l=active();if(l&&confirm('Remove layer '+l.name+'?')){removeLayer(l.id);activeId=null;refresh()}};
  }
  function refresh(){renderCatalog();renderContents();$('#gp-status-layers').textContent=S.layers.length+' layers';const l=active();if(l)activeId=l.id}
  function layerMenu(){const l=active();if(!l)return;const a=prompt('Layer options: type 1 rename, 2 zoom, 3 attribute table, 4 remove','1');if(a==='1'){const n=prompt('New layer name',l.name);if(n){l.name=n;refresh()}}else if(a==='2')zoomTo(l);else if(a==='3')openTable();else if(a==='4'&&confirm('Remove '+l.name+'?')){removeLayer(l.id);activeId=null;refresh()}}
  function selectFeature(layer,feature){selected={layerId:layer.id,feature};activeId=layer.id;$('#gp-status-selection').textContent='Selected: '+(feature.properties?.name||feature.id||'Feature');renderEditbar();if($('#gp-attr-dock').classList.contains('open'))renderTable()}
  function wireSelection(){
   S.layers.filter(l=>l.type==='vector').forEach(l=>{if(!l.lyr)return;l.lyr.eachLayer(leaf=>{if(leaf.__gpSelect)return;leaf.__gpSelect=true;leaf.on('click',()=>{if(!editing&&activeRibbon!=='edit')return;const f=leaf.feature;if(f)selectFeature(l,f)})})})
  }
  function openTable(){const l=active();if(!l||l.type!=='vector'){notify('Select a vector layer first');return}activeId=l.id;$('#gp-attr-dock').classList.add('open');$('#gp-attr-title').textContent='Attribute table — '+l.name;attrTab='records';renderTable()}
  function renderTable(){
   const l=active();if(!l||l.type!=='vector')return;$('#gp-attr-title').textContent='Attribute table — '+l.name;
   if(attrTab==='fields'){
    const fields=fieldsOf(l);$('#gp-attr-scroll').innerHTML='<div class="gp-field-list">'+fields.map(f=>'<div class="gp-field-chip"><b>'+esc(f)+'</b><span class="gp-muted">'+typeof l.data.features.find(x=>x.properties&&x.properties[f])?.properties?.[f]+'</span><button data-rename-field="'+esc(f)+'">Rename</button><button data-delete-field="'+esc(f)+'">Delete</button></div>').join('')+'</div>';
    $$('[data-rename-field]').forEach(b=>b.onclick=()=>{const old=b.dataset.renameField,n=prompt('New field name',old);if(!n||n===old)return;l.data.features.forEach(f=>{if(Object.prototype.hasOwnProperty.call(f.properties||{},old)){f.properties[n]=f.properties[old];delete f.properties[old]}});renderTable();refresh()});
    $$('[data-delete-field]').forEach(b=>b.onclick=()=>{const f=b.dataset.deleteField;if(confirm('Delete field '+f+' from all features?')){l.data.features.forEach(x=>delete x.properties[f]);renderTable();refresh()}});
    return;
   }
   const fields=fieldsOf(l);const rows=l.data.features.slice(0,1000);
   $('#gp-attr-scroll').innerHTML=rows.length?'<table id="gp-attr-table"><thead><tr><th>FID</th>'+fields.map(f=>'<th>'+esc(f)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((f,i)=>'<tr data-feature-row="'+i+'" class="'+(selected?.feature===f?'selected':'')+'"><td>'+(i+1)+'</td>'+fields.map(k=>'<td><input data-cell="'+i+'" data-field="'+esc(k)+'" value="'+esc(f.properties?.[k]??'')+'"></td>').join('')+'</tr>').join('')+'</tbody></table>':'<div class="gp-empty">No features in this layer</div>';
   $$('[data-cell]').forEach(inp=>inp.onchange=()=>{const f=rows[+inp.dataset.cell],k=inp.dataset.field,old=f.properties[k],v=inp.value;f.properties[k]=typeof old==='number'&&v.trim()!==''?Number(v):v});
   $$('[data-feature-row]').forEach(tr=>tr.onclick=()=>{const f=rows[+tr.dataset.featureRow];selectFeature(l,f);$$('[data-feature-row]').forEach(x=>x.classList.toggle('selected',x===tr))});
  }
  function addField(){const l=active();if(!l||l.type!=='vector'){notify('Choose a vector layer');return}const n=prompt('New field name');if(!n)return;if(fieldsOf(l).includes(n)){notify('Field already exists');return}const type=(prompt('Field type: text, number, boolean','text')||'text').toLowerCase();l.data.features.forEach(f=>{f.properties=f.properties||{};f.properties[n]=type==='number'?0:type==='boolean'?false:''});attrTab='fields';renderTable();refresh()}
  function deleteSelected(){if(!selected)return notify('Select a feature first');const l=byId(selected.layerId);if(!l)return;l.data.features=l.data.features.filter(f=>f!==selected.feature);selected=null;afterChange();wireSelection();refresh();if($('#gp-attr-dock').classList.contains('open'))renderTable();notify('Selected feature deleted')}
  function action(a){
   if(a==='open')$('#btn-open').click();else if(a==='gdb')$('#btn-gdb').click();else if(a==='gps')$('#btn-gps').click();
   else if(a==='create'){editing=true;renderEditbar();openDigitizeDialog()}
   else if(a==='select'){editing=true;activeRibbon='edit';setRibbon('edit');notify('Tap a feature on the map to select it')}
   else if(a==='delete')deleteSelected();
   else if(a==='save'){afterChange();wireSelection();notify('Edits applied to the current project session')}
   else if(a==='discard'){if(confirm('Reloading source data is not available for unsaved in-memory edits. Clear current selection instead?')){selected=null;renderEditbar()}}
   else if(a==='table')openTable();else if(a==='addfield'){openTable();addField()}
   else if(a==='extent'){const bounds=[];S.layers.filter(l=>l.visible).forEach(l=>{try{const b=l.type==='raster'?L.latLngBounds(l.raster.bounds):L.geoJSON(l.data).getBounds();if(b.isValid())bounds.push(b)}catch(e){}});if(bounds.length){const b=bounds.reduce((a,x)=>a.extend(x),bounds[0]);map.fitBounds(b.pad(.05))}}
   else if(a==='basemap'){$('#basemap-select').focus()}
   else if(a==='catalog'){$('#gp-catalog').style.display='block'}
   else if(a==='contents'){$('#gp-contents').style.display='block'}
   else if(a==='tools')showTab('tools');else if(a==='python')showTab('python');else if(a==='layout'){showTab('layout');setRibbon('insert')}
   else if(a==='street'){$('#basemap-select').value='osm';$('#basemap-select').dispatchEvent(new Event('change'))}
   else if(a==='satellite'){$('#basemap-select').value='imagery';$('#basemap-select').dispatchEvent(new Event('change'))}
   else if(['text','legend','north','scale','picture','mapframe'].includes(a)){showTab('layout');insertLayoutElement(a)}
  }
  function insertLayoutElement(kind){
   const page=$('#page');if(!page)return;
   let el=document.createElement('div');el.className='box gp-layout-element';el.contentEditable='true';
   const labels={text:'Text element — click to edit',legend:'Legend element',north:'N ↑',scale:'Scale bar 0 ───── 10 km',picture:'Picture element — choose image',mapframe:'Map frame'};
   if(kind==='legend'){el.innerHTML='<b>Legend</b><div id="gp-extra-legend">'+(typeof legendHTML==='function'?legendHTML():'')+'</div>'}
   else if(kind==='picture'){const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.onchange=()=>{const f=inp.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{el.contentEditable='false';el.innerHTML='<img alt="Inserted map layout image" style="max-width:100%;max-height:180px" src="'+rd.result+'">'};rd.readAsDataURL(f)};el.append('Insert image: ',inp)}
   else if(kind==='mapframe'){el.textContent='Map frame placeholder — use map extent in the existing map frame'}
   else el.textContent=labels[kind]||'Text element';
   const side=$('.p-side',page);side.appendChild(el);notify('Inserted '+kind+' element into layout')
  }
  $$('.gp-rib-tab').forEach(b=>b.onclick=()=>setRibbon(b.dataset.rib));
  $('#gp-refresh').onclick=refresh;$('#gp-open-table').onclick=openTable;$('#gp-close-table').onclick=()=>dock.classList.remove('open');$('#gp-save-table').onclick=()=>{afterChange();wireSelection();notify('Attribute edits saved in this session')};
  $('#gp-add-field').onclick=addField;$$('[data-atab]').forEach(b=>b.onclick=()=>{attrTab=b.dataset.atab;$$('[data-atab]').forEach(x=>x.classList.toggle('active',x===b));renderTable()});
  if(typeof S!=='undefined'){
   const original=window.afterChange;
   if(typeof original==='function'&&!window.__gpWrapped){window.afterChange=function(){original();refresh();wireSelection()};window.__gpWrapped=true}
  }
  const originalShow=window.showTab;if(typeof originalShow==='function'&&!window.__gpShowWrapped){window.showTab=function(t){originalShow(t);if(t==='layout')setRibbon('insert');if(t==='map'||t==='layers')refresh()};window.__gpShowWrapped=true}
  setRibbon('map');renderCatalog();renderContents();renderEditbar();refresh();
  map.on('layeradd',wireSelection);
  map.on('click',()=>{if(editing)wireSelection()});
  $('#gp-status-project').textContent='Project: GeoLite';
  // Add layout insert controls to the existing layout view.
  const laytb=$('#view-layout .tb');if(laytb){const tools=document.createElement('div');tools.id='gp-layout-tools';tools.innerHTML='<b style="font-size:11px">Insert element:</b><button data-layout="text">Text</button><button data-layout="legend">Legend</button><button data-layout="north">North arrow</button><button data-layout="scale">Scale bar</button><button data-layout="picture">Picture</button><button data-layout="mapframe">Map frame</button>';laytb.parentNode.insertBefore(tools,laytb.nextSibling);$$('[data-layout]').forEach(b=>b.onclick=()=>insertLayoutElement(b.dataset.layout))}
  // Attribute table quick open on desktop and a clean initial catalog.
  return true;
 }
 waitFor(boot);
})();