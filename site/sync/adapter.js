(async()=>{
  const adapter={app:'tsugi',empty:()=>({entries:[]}),editing:()=>!!document.querySelector('dialog[open]:not(.sync-dialog)')||!!document.activeElement?.matches('#links-form input'),read:async()=>{const raw=localStorage.getItem('tsugi-library-v1');const doc=raw?JSON.parse(raw):{entries:[]};TsugiDomain.validate(doc);return doc;},imageIds:()=>[],image:async()=>null,export:doc=>({format:'tsugi',version:1,...doc}),validate:async doc=>TsugiDomain.validate(doc),freeze:()=>{
    // Search and navigation never mutate the library: keep them focusable while saving.
    const nodes=[...document.querySelectorAll('#library-grid,#catalog-grid,#manual,.import,#bulk-controls,#links-list,#links-form')],values=nodes.map(el=>el.inert);
    nodes.forEach(el=>el.inert=true);
    return()=>nodes.forEach((el,i)=>el.inert=values[i]);
  },apply:async doc=>{TsugiApp.apply(doc);setTimeout(()=>TsugiApp.refreshAll(true),0);}};
  // Storage and the displayed library may diverge after another tab writes.
  // Reconcile both before reporting a successful synchronization.
  adapter.current=()=>TsugiApp.read();
  window.tsugiSync=new PersonalSync(adapter);
  try{await tsugiSync.init();TsugiApp.refreshAll(true);}catch(e){tsugiSync.message('Synchronisation indisponible : '+e.message);}
})();
