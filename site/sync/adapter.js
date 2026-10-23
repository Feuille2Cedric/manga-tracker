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
  adapter.syncWhileEditing=true;
  adapter.pending=base=>TsugiLibrarySync.pending(base,TsugiApp.read());
  adapter.merge=(base,local,remote)=>{
    [base,local,remote].forEach(TsugiDomain.validate);
    const result=TsugiLibrarySync.reconcile(base,local,remote);
    TsugiDomain.validate(result.document);
    if(result.combined){
      // Keep original versions before any automatic conflict resolution.
      // If storage is full, fail safely and leave both libraries untouched.
      const key='tsugi-sync-recovery-v1',owner=window.tsugiSync.user.id;
      const backups=JSON.parse(localStorage.getItem(key)||'[]');
      backups.push({owner,at:new Date().toISOString(),base,local,remote});
      localStorage.setItem(key,JSON.stringify(backups.slice(-3)));
    }
    return result.document;
  };
  window.tsugiSync=new PersonalSync(adapter);
  const recovery=document.createElement('button');recovery.type='button';recovery.className='auth-secondary';recovery.textContent='Exporter les sauvegardes de synchronisation';
  document.querySelector('#sync-connected').append(recovery);
  recovery.hidden=true;
  adapter.accountOpened=()=>{try{recovery.hidden=!JSON.parse(localStorage.getItem('tsugi-sync-recovery-v1')||'[]').some(b=>b.owner===tsugiSync.user?.id);}catch{recovery.hidden=true;}};
  recovery.onclick=()=>{
    if(!tsugiSync.user||tsugiSync.meta.owner!==tsugiSync.user.id)return;
    const backups=JSON.parse(localStorage.getItem('tsugi-sync-recovery-v1')||'[]').filter(b=>b.owner===tsugiSync.user.id);
    if(!backups.length){tsugiSync.message('Aucune fusion simultanée à récupérer. Ta bibliothèque reste exportable depuis le menu ···.');return;}
    const documents=backups.map(b=>({...b,local:{format:'tsugi',version:1,...b.local},remote:{format:'tsugi',version:1,...b.remote}}));
    const url=URL.createObjectURL(new Blob([JSON.stringify(documents,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tsugi-sauvegardes-synchro.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  try{await tsugiSync.init();TsugiApp.refreshAll(true);}catch(e){tsugiSync.message('Synchronisation indisponible : '+e.message);}
})();
