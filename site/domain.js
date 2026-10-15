(function(root){
  'use strict';
  const statuses=['reading','completed','planned','paused','dropped'];
  function total(entry,meta){return entry.manualTotal ?? meta?.total ?? null;}
  function available(entry,meta,mu){return entry.manualTotal ?? (entry.kind==='anime'&&meta?.ongoing ? meta.available : meta?.total) ?? mu?.latest ?? meta?.latest ?? null;}
  function validate(doc){
    if(!doc||!Array.isArray(doc.entries)||doc.entries.length>10000)throw Error('Sauvegarde invalide.');
    const ids=new Set();
    for(const e of doc.entries){
      if(!e||typeof e.id!=='string'||!/^(manga|anime):[1-9][0-9]*$|^manual:[a-zA-Z0-9-]+$/.test(e.id)||ids.has(e.id)||!['manga','anime'].includes(e.kind)||(!e.id.startsWith('manual:')&&!e.id.startsWith(e.kind+':'))||typeof e.title!=='string'||!e.title.trim()||e.title.length>300||!Number.isSafeInteger(e.progress)||e.progress<0||!statuses.includes(e.status)||!Number.isFinite(e.updated)||e.manualTotal!=null&&(!Number.isSafeInteger(e.manualTotal)||e.manualTotal<1)||e.muId!=null&&!/^mu:[1-9][0-9]*$/.test(e.muId))throw Error('Une entrée de la sauvegarde est invalide.');
      ids.add(e.id);
    }
  }
  const trophies=[
    {id:'first',icon:'芽',name:'Le premier pas',description:'Ajouter ton premier manga à la bibliothèque.',goal:1,value:es=>es.filter(e=>e.kind==='manga').length},
    {id:'hundred',icon:'百',name:'Encore un petit chapitre',description:'Lire 100 chapitres. On connaît la chanson.',goal:100,value:es=>es.filter(e=>e.kind==='manga').reduce((s,e)=>s+e.progress,0)},
    {id:'thousand',icon:'千',name:'Les nuits sont courtes',description:'Atteindre 1 000 chapitres lus.',goal:1000,value:es=>es.filter(e=>e.kind==='manga').reduce((s,e)=>s+e.progress,0)},
    {id:'five',icon:'五',name:'Générique de fin',description:'Terminer 5 mangas. Et en commencer 12 autres.',goal:5,value:es=>es.filter(e=>e.kind==='manga'&&e.status==='completed').length},
    {id:'library',icon:'庫',name:'Une étagère ne suffit plus',description:'Avoir 25 mangas dans ta bibliothèque.',goal:25,value:es=>es.filter(e=>e.kind==='manga').length},
    {id:'dragon',icon:'龍',name:'Les sept boules sont réunies',description:'Terminer le manga Dragon Ball. Shenron approuve.',goal:1,value:es=>es.some(e=>e.id==='manga:111'&&e.status==='completed')?1:0},
    {id:'pirate',icon:'海',name:'Cap sur Grand Line',description:'Lire 100 chapitres de One Piece. Le voyage commence.',goal:100,value:es=>es.find(e=>e.id==='manga:38')?.progress||0},
    {id:'anime',icon:'映',name:'Passer le générique ? Jamais.',description:'Regarder 100 épisodes d’animé.',goal:100,value:es=>es.filter(e=>e.kind==='anime').reduce((s,e)=>s+e.progress,0)}
  ];
  root.TsugiDomain={statuses,total,available,validate,trophies};
  if(typeof module!=='undefined')module.exports=root.TsugiDomain;
})(typeof window!=='undefined'?window:globalThis);
