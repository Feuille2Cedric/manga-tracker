'use strict';
const $=s=>document.querySelector(s), D=TsugiDomain, KEY='tsugi-library-v1', CACHE='tsugi-catalog-v2-safe';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeImage=u=>{try{const x=new URL(u);return x.protocol==='https:'&&['media.kitsu.app','media.kitsu.io'].includes(x.hostname)?x.href:'';}catch{return '';}};
const safeLink=u=>{try{const x=new URL(u);return x.protocol==='https:'&&['kitsu.app','kitsu.io','www.mangaupdates.com','mangaupdates.com'].includes(x.hostname)?x.href:'#';}catch{return '#';}};
let library={entries:[]}, metadata={}, kind='manga', status='all', view='library', catalog=[], searchPage=1, hasNext=false, searchGeneration=0, activeId=null, activeMeta=null, refreshBusy=false, detailDirty=false;
try{const raw=localStorage.getItem(KEY);if(raw){library=JSON.parse(raw);D.validate(library);}}catch{library={entries:[]};setTimeout(()=>toast('La sauvegarde locale est illisible. Elle a été conservée ; importe une sauvegarde valide.'),100);}
try{metadata=JSON.parse(localStorage.getItem(CACHE)||'{}');if(!metadata||Array.isArray(metadata)||typeof metadata!=='object')metadata={};}catch{metadata={};}
const labels={reading:'En cours',completed:'Terminé',planned:'À lire',paused:'En pause',dropped:'Abandonné'};
const nf=new Intl.NumberFormat('fr-FR');
const entryFor=id=>library.entries.find(e=>e.id===id);
const metaFor=e=>metadata[e.id]||{id:e.id,title:e.title,kind:e.kind,total:null};
const avail=e=>D.available(e,metaFor(e),metadata[e.muId||metaFor(e).releaseId]);
const isCaught=e=>e.status==='reading'&&avail(e)!=null&&e.progress>=avail(e);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function cache(data){metadata[data.id]=data;try{localStorage.setItem(CACHE,JSON.stringify(metadata));}catch{/* Catalogue can be fetched again; personal data is separate. */}}
function persist(next){
  next={...library,...next};
  D.validate(next);
  try{localStorage.setItem(KEY,JSON.stringify(next));}catch{toast('Stockage plein ou indisponible. La modification n’a pas été enregistrée. Exporte ta bibliothèque.');return false;}
  const before=new Set(D.trophies.filter(t=>t.value(library.entries)>=t.goal).map(t=>t.id));
  library=next;window.tsugiSync?.mark();render();
  const unlocked=D.trophies.find(t=>!before.has(t.id)&&t.value(library.entries)>=t.goal);
  if(unlocked)toast('✧ Trophée débloqué : '+unlocked.name);
  return true;
}
function change(id,patch){const next=structuredClone(library),e=next.entries.find(e=>e.id===id);if(!e)return false;Object.assign(e,patch,{updated:Date.now()});return persist(next);}
async function api(action,params={}){
  const session=window.tsugiSync?.client ? (await window.tsugiSync.client.auth.getSession()).data.session : null;
  if(!session){
    if(!['search','get','volumes','seasons'].includes(action)||String(params.id||'').startsWith('mu:'))throw Error('Connecte-toi pour associer le suivi des sorties MangaUpdates.');
    const provider=await import('./catalog.mjs');
    return action==='search'?provider.searchMedia(params):action==='volumes'?provider.getVolumes(params.id):action==='seasons'?provider.getSeasons(params.id):provider.getMedia(params.id);
  }

  const config=PERSONAL_SYNC_CONFIG;
  const response=await fetch(config.url+'/functions/v1/manga-catalog',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,...params}),signal:AbortSignal.timeout(55000)});
  const result=await response.json();if(!response.ok||result.error){const error=new Error(result.error||result.message||'Catalogue momentanément indisponible.');error.code=result.code;throw error;}return result;
}
function cover(meta,badge=''){const image=safeImage(meta.image);return `${image?`<img src="${esc(image)}" alt="Couverture de ${esc(meta.title)}" loading="lazy" referrerpolicy="no-referrer">`:'<span class="fallback-cover" aria-hidden="true">次</span>'}${badge}`;}
function card(meta,entry){
  const saved=entry||entryFor(meta.id), known=saved?avail(saved):meta.total, progress=saved?.progress||0;
  const caught=saved&&isCaught(saved), remaining=known==null?null:Math.max(0,known-progress);
  const badge=entry?`<span class="badge ${remaining>0&&entry.status==='reading'?'new':''}">${esc(caught?'À jour ✓':labels[entry.status])}</span>`:`<span class="badge">${esc(meta.format||meta.kind)}${meta.score?' · ★ '+esc(meta.score):''}</span>`;
  return `<article class="card"><button class="cover-button" data-detail="${esc(meta.id)}" aria-label="Ouvrir ${esc(meta.title)}">${cover(meta,badge)}</button><div class="card-body"><button class="card-title" data-detail="${esc(meta.id)}" title="${esc(meta.title)}">${esc(meta.title)}</button>${entry?`<div class="progress-info"><span>${entry.kind==='manga'?'Chap.':'Ép.'} <strong>${nf.format(progress)}</strong> / ${known==null?'?':nf.format(known)}</span><span>${remaining==null?'':caught?'À jour':''}</span></div><div class="bar"><span style="width:${known?Math.min(100,progress/known*100):0}%"></span></div><div class="card-actions">${D.safeReadingUrl(entry.readingUrl)?`<a class="read-button" href="${esc(D.safeReadingUrl(entry.readingUrl))}" target="_blank" rel="noopener noreferrer" aria-label="${entry.kind==='manga'?'Lire':'Regarder'} ${esc(meta.title)}">${entry.kind==='manga'?'Lire':'Regarder'} ↗</a>`:''}<button class="plus" data-increment="${esc(meta.id)}" ${known!=null&&progress>=known?'disabled':''}>＋ 1 ${entry.kind==='manga'?'chapitre':'épisode'}</button></div>`:`<div class="card-actions"><button class="plus" ${saved?`data-detail="${esc(meta.id)}"`:`data-add="${esc(meta.id)}"`}>${saved?'✓ Dans ma bibliothèque':'＋ Ajouter'}</button></div>`}</div></article>`;
}
function render(){
  const es=library.entries, manga=es.filter(e=>e.kind==='manga');
  $('#nav-count').textContent=es.length;$('#library-count').textContent=es.filter(e=>e.kind===kind).length;
  $('#stat-chapters').textContent=nf.format(manga.reduce((s,e)=>s+e.progress,0));
  $('#stat-completed').textContent=manga.filter(e=>e.status==='completed').length;
  $('#stat-episodes').textContent=nf.format(es.filter(e=>e.kind==='anime').reduce((s,e)=>s+e.progress,0));
  $('#stat-achievements').innerHTML=D.trophies.filter(t=>t.value(es)>=t.goal).length+' <i>/ '+D.trophies.length+'</i>';
  const query=$('#library-search').value.trim().toLocaleLowerCase('fr');
  let visible=es.filter(e=>!metaFor(e).blocked&&e.kind===kind&&(status==='all'||status==='caught'&&isCaught(e)||e.status===status)&&(e.title+' '+(metaFor(e).alternate||'')).toLocaleLowerCase('fr').includes(query));
  const sort=$('#sort').value;visible.sort(sort.startsWith('size-')?(a,b)=>D.compareSize(a,b,avail,sort==='size-asc'?1:-1):sort==='title'?(a,b)=>a.title.localeCompare(b.title,'fr'):sort==='remaining'?(a,b)=>Math.max(0,(avail(b)||0)-b.progress)-Math.max(0,(avail(a)||0)-a.progress):(a,b)=>b.updated-a.updated);
  $('#library-grid').innerHTML=visible.length?visible.map(e=>card(metaFor(e),e)).join(''):`<div class="empty"><div class="empty-icon">${es.length?'⌕':'次'}</div><h3>${es.length?'Pas de titre dans cette sélection.':'Chaque collection commence par une histoire.'}</h3><p>${es.length?'Change les filtres ou ajoute un nouveau titre à ta bibliothèque.':'Retrouve tes mangas préférés, indique ton dernier chapitre et laisse les aventures reprendre.'}</p><button class="primary" data-explore>Explorer les mangas ↗</button></div>`;
  $('#achievement-grid').innerHTML=(window.TsugiEnhancements?.trophyList()||D.trophies).map(t=>{const value=t.value(es),unlocked=value>=t.goal;return `<article class="achievement ${unlocked?'unlocked':''}"><div class="achievement-icon">${t.icon}</div><h3>${t.name}</h3><p>${t.description}</p><div class="bar"><span style="width:${Math.min(100,value/t.goal*100)}%"></span></div><small>${unlocked?'✧ Débloqué':nf.format(value)+' / '+nf.format(t.goal)}</small></article>`;}).join('');
  if(catalog.length)$('#catalog-grid').innerHTML=catalog.map(m=>card(m)).join('');
  window.TsugiEnhancements?.render(visible);
}
function navigate(){view=['discover','achievements','links'].includes(location.hash.slice(1))?location.hash.slice(1):'library';document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');document.querySelectorAll('nav a').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#breadcrumb').textContent='MON ESPACE / '+({library:'BIBLIOTHÈQUE',discover:'EXPLORER',achievements:'TROPHÉES',links:'LIENS DE LECTURE'}[view]);if(view==='discover'&&!catalog.length)search();}
function explore(){location.hash='discover';$('#catalog-kind').value=kind;}
async function search(){
  const generation=++searchGeneration;
  $('#catalog-message').textContent='Recherche dans le catalogue…';$('#next').disabled=true;$('#previous').disabled=true;
  try{const result=await api('search',{kind:$('#catalog-kind').value,query:$('#catalog-query').value.trim(),page:searchPage});if(generation!==searchGeneration)return;
    catalog=result.data;hasNext=result.hasNext;catalog.forEach(m=>{if(!metadata[m.id])cache(m);});
    $('#catalog-message').textContent=catalog.length?'Mangas, manhwas, manhuas et adaptations : trouve ta prochaine histoire.':'Aucun résultat. Essaie le titre original ou ajoute ta série manuellement.';
    $('#catalog-grid').innerHTML=catalog.map(m=>card(m)).join('');$('#page-label').textContent='Page '+searchPage;$('#next').disabled=!hasNext;$('#previous').disabled=searchPage===1;
  }catch(e){if(generation!==searchGeneration)return;$('#catalog-message').textContent=e.message;$('#catalog-grid').innerHTML='<div class="empty"><h3>Le catalogue fait une pause.</h3><p>Ta bibliothèque reste disponible. Tu peux réessayer la recherche ou ajouter un titre manuellement.</p><button class="secondary" data-retry>Réessayer</button></div>';$('#previous').disabled=searchPage===1;}
}
function add(meta){
  if(entryFor(meta.id))return;
  cache(meta);
  if(persist({entries:[...library.entries,{id:meta.id,kind:meta.kind,title:meta.title,progress:0,status:'reading',manualTotal:null,muId:null,updated:Date.now()}]})){toast('Ajouté à ta bibliothèque.');loadMeta(meta.id).catch(()=>{});}
}
async function loadMeta(id){
  if(id.startsWith('manual:'))return metadata[id];
  const old=metadata[id];if(old?.contentPolicy===2&&(old.detailLoaded||id.startsWith('mu:'))&&Date.now()-Date.parse(old.fetchedAt)<86400000)return old;
  try{const result=await api('get',{id});cache(result.data);render();return result.data;}catch(error){if(error.code==='CONTENT_FILTERED'){cache({id,title:'Contenu masqué',kind:id.split(':')[0],blocked:true,contentPolicy:2});render();}throw error;}
}
function detailMarkup(meta){
  const e=entryFor(meta.id),known=e?avail(e):meta.total,mu=e?.muId?metadata[e.muId]:metadata[meta.releaseId]||meta.release||null;
  const image=safeImage(meta.image),date=meta.fetchedAt?new Date(meta.fetchedAt).toLocaleDateString('fr-FR'):null;
  return `<div class="detail-header">${image?`<img src="${esc(image)}" alt="Couverture de ${esc(meta.title)}">`:''}<div><p class="eyebrow">${esc(meta.format||meta.kind)}${meta.score?' · ★ '+esc(meta.score):''}</p><h2>${esc(meta.title)}</h2><p>${esc(meta.alternate||'')}<br>${esc(meta.publication||'')}</p></div></div><p class="synopsis">${esc(meta.synopsis||'Ton aventure, à ton rythme.')}</p>${e?`<form id="progress-form"><div class="form-row"><label>Dernier ${e.kind==='manga'?'chapitre lu':'épisode vu'}<input name="progress" type="number" min="0" step="1" required value="${e.progress}"></label><label>Dans ma collection<select name="status">${D.statuses.map(s=>`<option value="${s}" ${e.status===s?'selected':''}>${s==='planned'&&e.kind==='anime'?'À voir':labels[s]}</option>`).join('')}</select></label></div><div class="form-row"><label>Total personnalisé (facultatif)<input name="manualTotal" type="number" min="1" step="1" value="${e.manualTotal??''}" placeholder="Automatique"></label><p class="muted">${known==null?'Total inconnu pour le moment.':`Dernier numéro disponible : ${esc(known)}.`}<br>Un total personnalisé remplace le suivi automatique. Vide le champ pour le réactiver.</p></div><label>Lien de ${e.kind==='manga'?'lecture':'visionnage'}<input name="readingUrl" type="url" maxlength="2048" placeholder="https://…" value="${esc(e.readingUrl||'')}"></label>${D.safeReadingUrl(e.readingUrl)?`<p><a id="open-reading-link" class="read-button" href="${esc(D.safeReadingUrl(e.readingUrl))}" target="_blank" rel="noopener noreferrer">${e.kind==='manga'?'Lire ce manga':'Regarder cet animé'} ↗</a></p>`:''}<div class="detail-actions"><button class="primary">Enregistrer</button><button type="button" class="secondary" id="catch-up" ${known==null?'disabled':''}>Me mettre à jour</button><button type="button" class="secondary danger" id="remove">Retirer</button></div></form>`:`<button class="primary" id="detail-add">＋ Ajouter à ma bibliothèque</button>`}<p id="detail-message" class="muted" role="status"></p><div class="source-info">${meta.url?`<a href="${esc(safeLink(meta.url))}" target="_blank" rel="noopener">Fiche ${esc(meta.source||'Kitsu')} ↗</a>`:'Ajout manuel'}${date?' · Vérifié le '+date:''}${meta.stale?' · Source indisponible, dernière valeur conservée':''}<br>${meta.total!=null?'Total annoncé : '+esc(meta.total):'Le catalogue ne fournit pas encore de total définitif.'}${e?.kind==='anime'&&meta.ongoing?'<br>Série en diffusion : le total annoncé peut inclure des épisodes à venir.':''}${mu?`<br><a href="${esc(safeLink(mu.url))}" target="_blank" rel="noopener">${esc(mu.title)} — MangaUpdates ↗</a> : ${mu.latest??'numéro inconnu'} · vérifié le ${new Date(mu.fetchedAt).toLocaleDateString('fr-FR')}${mu.stale?' (dernière valeur conservée)':''}`:''}</div>${e&&e.kind==='manga'?`<details id="mu-link"><summary>Suivre les nouveaux chapitres avec MangaUpdates ${e.muId?'✓':''}</summary><p class="muted">Associe la bonne fiche pour les séries en cours. Le numéro signalé correspond aux sorties recensées par MangaUpdates : ce n’est pas forcément la dernière publication officielle ni une sortie en français.</p><form id="mu-form" class="discovery-search"><label class="search"><input name="query" value="${esc(meta.title)}" required minlength="2" maxlength="100" aria-label="Titre dans MangaUpdates"></label><button class="secondary">Rechercher</button></form><div id="mu-results" class="mu-results"></div>${e.muId?'<button id="mu-unlink" class="text-button">Dissocier cette fiche</button>':''}</details>`:''}<div class="relations">${(meta.relations||[]).map(r=>`<button class="secondary" data-relation="${esc(r.id)}">${esc(r.title)} <span>${r.kind==='anime'?'Animé':'Manga'} ↗</span></button>`).join('')}</div>${window.TsugiEnhancements?.detailMarkup(meta,e)||''}`;
}
function drawDetail(meta){
  activeMeta=meta;$('#detail-content').innerHTML=detailMarkup(meta);
  $('#detail-add')?.addEventListener('click',()=>{add(meta);drawDetail(meta);});
  $('#progress-form')?.addEventListener('submit',event=>{event.preventDefault();const f=new FormData(event.target),progress=Number(f.get('progress')),manualTotal=f.get('manualTotal')?Number(f.get('manualTotal')):null;if(manualTotal!=null&&progress>manualTotal){$('#detail-message').textContent='Le total personnalisé doit être supérieur ou égal à ta progression.';return;}const rawUrl=String(f.get('readingUrl')||'').trim(),readingUrl=rawUrl?D.safeReadingUrl(rawUrl):'';if(rawUrl&&!readingUrl){$('#detail-message').textContent='Utilise un lien http ou https sans identifiants.';return;}if(change(meta.id,{progress,status:f.get('status'),manualTotal,readingUrl})){$('#detail').close();toast('Progression enregistrée.');}});
  $('#catch-up')?.addEventListener('click',()=>{const e=entryFor(meta.id),n=avail(e);if(n!=null){detailDirty=true;$('#progress-form [name=progress]').value=Math.max(e.progress,Math.floor(n));if(!meta.ongoing&&D.total(e,meta)!=null)$('#progress-form [name=status]').value='completed';}});
  $('#remove')?.addEventListener('click',()=>{if(confirm('Retirer « '+meta.title+' » et sa progression de ta bibliothèque ?')){if(persist({entries:library.entries.filter(e=>e.id!==meta.id)}))$('#detail').close();}});
  $('#mu-form')?.addEventListener('submit',async event=>{event.preventDefault();const target=$('#mu-results');target.textContent='Recherche…';try{const result=await api('muSearch',{query:new FormData(event.target).get('query')});if(activeId!==meta.id)return;target.innerHTML=result.data.length?result.data.map(r=>`<button class="secondary" data-mu="${esc(r.id)}">${esc(r.title)} ${r.year?'('+esc(r.year)+')':''} ↗</button>`).join(''):'Aucune fiche trouvée.';}catch(e){target.textContent=e.message;}});
  $('#mu-unlink')?.addEventListener('click',()=>{change(meta.id,{muId:null});drawDetail(meta);});
  window.TsugiEnhancements?.bindDetail(meta);
}
async function openDetail(id){
  activeId=id;detailDirty=false;const initial=metadata[id]||catalog.find(m=>m.id===id)||{id,title:entryFor(id)?.title||'Chargement…',kind:id.split(':')[0]};drawDetail(initial);if(!$('#detail').open)$('#detail').showModal();
  if(id.startsWith('manual:'))return;
  try{const meta=await loadMeta(id);if(activeId===id&&$('#detail').open&&!detailDirty)drawDetail(meta);}catch(e){if(activeId===id)$('#detail-message').textContent=e.message;}
}
async function refreshAll(silent=false){
  if(refreshBusy||window.tsugiSync?.meta.owner&&window.tsugiSync.meta.owner!==window.tsugiSync.user?.id)return;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date());
  const checkedToday=localStorage.getItem('tsugi-release-day')===day;
  let ids=[...new Set(library.entries.flatMap(e=>[e.id,e.muId||metaFor(e).releaseId]).filter(id=>id&&!id.startsWith('manual:')))];
  // A newly synced title still needs its initial metadata after today's check.
  if(checkedToday)ids=ids.filter(id=>!metadata[id]&&localStorage.getItem('tsugi-initial:'+id)!==day);
  if(!ids.length){if(!silent)toast(checkedToday?'La vérification des sorties a déjà été faite aujourd’hui.':'Ajoute d’abord un titre à ta bibliothèque.');return;}
  refreshBusy=true;$('#refresh').disabled=true;let failures=0,stale=0;
  localStorage.setItem('tsugi-release-day',day);
  for(let i=0;i<ids.length;i++){
    localStorage.setItem('tsugi-initial:'+ids[i],day);
    $('#refresh-status').textContent=`Vérification des sorties… ${i+1} / ${ids.length}`;
    try{const m=await loadMeta(ids[i]);if(m?.stale)stale++;}catch{failures++;}
    if(i<ids.length-1)await new Promise(r=>setTimeout(r,1100));
  }
  $('#refresh-status').textContent=failures||stale?`Vérification partielle : ${failures+stale} source(s) indisponible(s). Les dernières valeurs sont conservées.`:'Sorties vérifiées · '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  refreshBusy=false;$('#refresh').disabled=false;render();
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-explore'))explore();
  if(button.hasAttribute('data-retry'))search();
  if(button.dataset.detail)openDetail(button.dataset.detail);
  if(button.dataset.add){const meta=catalog.find(m=>m.id===button.dataset.add)||metadata[button.dataset.add];if(meta)add(meta);}
  if(button.dataset.increment){const e=entryFor(button.dataset.increment),n=avail(e);if(n==null||e.progress<n){const progress=e.progress+1,meta=metaFor(e);change(e.id,{progress,status:!meta.ongoing&&D.total(e,meta)!=null&&progress>=D.total(e,meta)?'completed':'reading'});}}
  if(button.dataset.kind){kind=button.dataset.kind;document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',b===button));document.querySelector('[data-status=planned]').textContent=kind==='anime'?'À voir':'À lire';render();}
  if(button.dataset.status){status=button.dataset.status;document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',b===button));render();}
  if(button.dataset.relation){const relation=activeMeta.relations.find(r=>r.id===button.dataset.relation);if(relation&&!metadata[relation.id])cache(relation);openDetail(button.dataset.relation);}
  if(button.dataset.mu){button.disabled=true;const id=activeId;try{const {data}=await api('get',{id:button.dataset.mu});cache(data);if(entryFor(id))change(id,{muId:data.id});if(activeId===id){drawDetail(activeMeta);toast('Suivi des sorties associé.');}}catch(e){toast(e.message);button.disabled=false;}}
});
$('#library-search').addEventListener('input',render);$('#sort').addEventListener('change',render);
$('#add').onclick=explore;$('#refresh').onclick=()=>refreshAll();
$('#search-form').onsubmit=e=>{e.preventDefault();searchPage=1;search();};$('#catalog-kind').onchange=()=>{searchPage=1;search();};
$('#next').onclick=()=>{searchPage++;search();};$('#previous').onclick=()=>{searchPage=Math.max(1,searchPage-1);search();};
$('#manual').onclick=()=>$('#manual-dialog').showModal();
$('#manual-form').onsubmit=event=>{event.preventDefault();const f=new FormData(event.target),id='manual:'+crypto.randomUUID(),title=String(f.get('title')).trim();if(!title)return;const total=f.get('total')?Number(f.get('total')):null;const meta={id,title,kind:f.get('kind'),total,ongoing:false,format:'Ajout manuel'};cache(meta);if(persist({entries:[...library.entries,{id,title,kind:meta.kind,progress:0,status:'reading',manualTotal:total,muId:null,updated:Date.now()}]})){$('#manual-dialog').close();event.target.reset();kind=meta.kind;document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.kind===kind));location.hash='library';render();}};
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#detail').addEventListener('close',()=>{activeId=null;window.tsugiSync?.cycle();});
$('#detail').addEventListener('input',()=>detailDirty=true);
$('#detail').addEventListener('change',()=>detailDirty=true);
$('#export').onclick=()=>{if(window.tsugiSync?.meta.owner&&window.tsugiSync.meta.owner!==window.tsugiSync.user?.id)return toast('Connecte-toi au compte propriétaire pour exporter.');const blob=new Blob([JSON.stringify({format:'tsugi',version:1,...library},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tsugi-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#import').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Sauvegarde trop volumineuse (10 Mo maximum).');const data=JSON.parse(await file.text());if(data.format!=='tsugi'||data.version!==1)throw Error('Choisis une sauvegarde Tsugi.');D.validate(data);if(confirm('Fusionner cette sauvegarde ? Pour les titres déjà présents, la progression actuelle sera conservée.')){const existing=new Set(library.entries.map(e=>e.id));const links=new Map((library.readingLinks||[]).map(l=>[l.url,l]));for(const l of data.readingLinks||[])if(!links.has(l.url))links.set(l.url,{...l,id:crypto.randomUUID()});persist({entries:[...library.entries,...data.entries.filter(e=>!existing.has(e.id))],readingLinks:[...links.values()]});refreshAll(true);}}catch(e){toast(e.message);}event.target.value='';};
window.addEventListener('hashchange',navigate);window.addEventListener('storage',event=>{if(event.key===KEY){try{const next=JSON.parse(event.newValue);D.validate(next);library=next;render();}catch{toast('Modification externe illisible. Recharge la page.');}}});
window.addEventListener('online',()=>refreshAll(true));
window.TsugiApp={read:()=>structuredClone(library),apply:doc=>{D.validate(doc);localStorage.setItem(KEY,JSON.stringify(doc));library=structuredClone(doc);render();},render,refreshAll};
render();navigate();
