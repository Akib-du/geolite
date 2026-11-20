/* Tablet-only desktop workspace enhancements: floating/docked panes, drag, shortcuts */
(()=>{
 const wait=fn=>{if(fn())return;const timer=setInterval(()=>{if(fn())clearInterval(timer)},120);setTimeout(()=>clearInterval(timer),20000)};
 const $=(s,r=document)=>r.querySelector(s);
 function boot(){
  const catalog=$('#gp-catalog'),contents=$('#gp-contents'),table=$('#gp-attr-dock'),ribbon=$('#gp-ribbon');
  if(!catalog||!contents||!table||!ribbon)return false;
  if($('#gp-orientation-hint'))return true;
  const hint=document.createElement('div');hint.id='gp-orientation-hint';hint.innerHTML='<span>↻</span><span>For the full GeoLite Pro workspace, rotate your tablet to landscape.</span>';
  ribbon.parentNode.insertBefore(hint,ribbon);
  function addPanelControl(panel,head,label){
   if(head.querySelector('.gp-panel-tools'))return;
   head.classList.add('gp-drag-handle');
   const tools=document.createElement('span');tools.className='gp-panel-tools';
   const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Float';toggle.title='Float this panel';
   const dock=document.createElement('button');dock.type='button';dock.textContent='Dock';dock.title='Dock this panel';dock.hidden=true;
   tools.append(toggle,dock);head.appendChild(tools);
   const saved={parent:panel.parentNode,next:panel.nextSibling};
   toggle.addEventListener('click',e=>{e.stopPropagation();floatPanel(panel,toggle,dock,label)});
   dock.addEventListener('click',e=>{e.stopPropagation();dockPanel(panel,toggle,dock,saved)});
   return {toggle,dock,saved};
  }
  function drag(panel,handle){
   let start=null;
   handle.addEventListener('pointerdown',e=>{
    if(e.target.closest('button,input,select,a'))return;
    if(!panel.classList.contains('gp-floating'))return;
    start={x:e.clientX,y:e.clientY,left:panel.offsetLeft,top:panel.offsetTop};
    handle.setPointerCapture?.(e.pointerId);e.preventDefault();
   });
   handle.addEventListener('pointermove',e=>{
    if(!start)return;
    panel.style.left=Math.max(0,start.left+e.clientX-start.x)+'px';
    panel.style.top=Math.max(0,start.top+e.clientY-start.y)+'px';
    panel.style.right='auto';
   });
   const end=()=>{start=null};
   handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  }
  function floatPanel(panel,toggle,dock,label){
   panel.classList.add('gp-floating');panel.style.display='flex';
   if(!panel.style.left&&!panel.style.right){panel.style.left=Math.max(12,(innerWidth-panel.offsetWidth)/2)+'px';panel.style.top='130px'}
   toggle.hidden=true;dock.hidden=false;toggle.classList.add('is-floating');
   panel.setAttribute('aria-label',label+' floating panel');
   if(typeof map!=='undefined'&&map) setTimeout(()=>map.invalidateSize(),80);
  }
  function dockPanel(panel,toggle,dock,saved){
   panel.classList.remove('gp-floating');panel.style.removeProperty('left');panel.style.removeProperty('top');panel.style.removeProperty('right');panel.style.removeProperty('width');panel.style.removeProperty('height');
   if(saved.parent&&panel.parentNode!==saved.parent)saved.parent.insertBefore(panel,saved.next&&saved.next.parentNode===saved.parent?saved.next:null);
   toggle.hidden=false;dock.hidden=true;toggle.classList.remove('is-floating');
   if(typeof map!=='undefined'&&map)setTimeout(()=>map.invalidateSize(),80);
  }
  const c=addPanelControl(catalog,$('.gp-pane-head',catalog),'Catalog');
  const o=addPanelControl(contents,$('.gp-pane-head',contents),'Contents');
  const tHead=$('#gp-attr-head');tHead.classList.add('gp-drag-handle');
  const tTools=document.createElement('span');tTools.className='gp-panel-tools';
  const tf=document.createElement('button');tf.type='button';tf.textContent='Float';tf.title='Float attribute table';
  const td=document.createElement('button');td.type='button';td.textContent='Dock';td.title='Dock attribute table';td.hidden=true;
  tTools.append(tf,td);tHead.insertBefore(tTools,$('#gp-close-table'));
  const tableSaved={parent:table.parentNode,next:table.nextSibling};
  tf.onclick=()=>floatPanel(table,tf,td,'Attribute table');
  td.onclick=()=>dockPanel(table,tf,td,tableSaved);
  drag(catalog,$('.gp-pane-head',catalog));drag(contents,$('.gp-pane-head',contents));drag(table,tHead);
  // Floating mode menu: preserve the default docked ArcGIS Pro arrangement.
  const bar=$('#gp-editbar');
  if(bar&&!$('#gp-panel-mode')){
   const mode=document.createElement('span');mode.id='gp-panel-mode';mode.style.cssText='margin-left:auto;display:flex;gap:5px;align-items:center;white-space:nowrap';
   mode.innerHTML='<button type="button" title="Float all panels">Float all</button><button type="button" title="Dock all panels">Dock all</button>';
   const [floatAll,dockAll]=mode.querySelectorAll('button');
   floatAll.onclick=()=>[ [catalog,c.toggle,c.dock,'Catalog'],[contents,o.toggle,o.dock,'Contents'],[table,tf,td,'Attribute table'] ].forEach(x=>floatPanel(...x));
   dockAll.onclick=()=>{dockPanel(catalog,c.toggle,c.dock,c.saved);dockPanel(contents,o.toggle,o.dock,o.saved);dockPanel(table,tf,td,tableSaved)};
   bar.appendChild(mode);
  }
  // Practical desktop shortcuts; avoid hijacking text entry.
  addEventListener('keydown',e=>{
   if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
   const tag=(document.activeElement?.tagName||'').toLowerCase();
   if(['input','textarea','select'].includes(tag)||document.activeElement?.isContentEditable)return;
   const k=e.key.toLowerCase();
   if(k==='s'){e.preventDefault();if(typeof afterChange==='function')afterChange();if(typeof toast==='function')toast('Current session refreshed. Export/save support depends on the active data format.')}
   else if(k==='t'){e.preventDefault();const b=$('#gp-open-table');if(b)b.click()}
   else if(k==='1'){e.preventDefault();$('[data-rib="map"]')?.click()}
   else if(k==='2'){e.preventDefault();$('[data-rib="edit"]')?.click()}
   else if(k==='3'){e.preventDefault();$('[data-rib="insert"]')?.click()}
   else if(k==='4'){e.preventDefault();$('[data-rib="view"]')?.click()}
  });
  // Keep Leaflet's canvas correctly sized after tablet rotation and panel changes.
  let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(typeof map!=='undefined'&&map)map.invalidateSize()},120)});
  return true;
 }
 wait(boot);
})();