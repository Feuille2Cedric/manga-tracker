(async()=>{
  const adapter={app:'tsugi',empty:()=>({entries:[]}),editing:()=>!!document.querySelector('dialog[open]:not(.sync-dialog)'),read:async()=>{const raw=localStorage.getItem('tsugi-library-v1');const doc=raw?JSON.parse(raw):{entries:[]};TsugiDomain.validate(doc);return doc;},imageIds:()=>[],image:async()=>null,export:doc=>({format:'tsugi',version:1,...doc}),validate:async doc=>TsugiDomain.validate(doc),freeze:()=>{const nodes=[...document.querySelectorAll('main,aside')],values=nodes.map(el=>el.inert);nodes.forEach(el=>el.inert=true);return()=>nodes.forEach((el,i)=>el.inert=values[i]);},apply:async doc=>{TsugiApp.apply(doc);setTimeout(()=>TsugiApp.refreshAll(true),0);}};
  window.tsugiSync=new PersonalSync(adapter);
  try{await tsugiSync.init();TsugiApp.refreshAll(true);}catch(e){tsugiSync.message('Synchronisation indisponible : '+e.message);}
})();
