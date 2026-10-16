import {CONTENT_POLICY,ContentFilteredError,isExplicit} from './content-policy.mjs';
const ROOT='https://kitsu.app/api/edge';
const positive=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
export function normalize(record,included=[]){
  const a=record.attributes||{},kind=record.type;
  const find=ref=>included.find(r=>r.id===ref?.id&&r.type===ref?.type);
  const related=(record.relationships?.mediaRelationships?.data||[]).map(find).filter(Boolean);
  const relations=related.filter(r=>['adaptation','source'].includes(r.attributes?.role)).map(r=>find(r.relationships?.destination?.data)).filter(r=>r&&['anime','manga'].includes(r.type)&&!isExplicit(r,included)).map(r=>({id:`${r.type}:${r.id}`,kind:r.type,title:r.attributes.canonicalTitle}));
  const seasons=related.filter(r=>['prequel','sequel'].includes(r.attributes?.role)).map(r=>find(r.relationships?.destination?.data)).filter(r=>r?.type==='anime'&&!isExplicit(r,included)).map(r=>({id:`anime:${r.id}`,kind:'anime',title:r.attributes.canonicalTitle,total:positive(r.attributes.episodeCount),format:r.attributes.subtype,startDate:r.attributes.startDate}));
  return {id:`${kind}:${record.id}`,kind,title:a.canonicalTitle||a.titles?.en_jp||a.titles?.en||'Sans titre',alternate:a.titles?.en||'',image:a.posterImage?.large||a.posterImage?.medium||'',total:positive(kind==='manga'?a.chapterCount:a.episodeCount),volumeCount:positive(a.volumeCount),seasons,startDate:a.startDate,contentPolicy:CONTENT_POLICY,ongoing:a.status!=='finished',publication:({current:'En cours de publication',finished:'Terminé',upcoming:'À paraître',unreleased:'À paraître',tba:'À confirmer'})[a.status]||a.status||'',format:a.subtype||kind,score:a.averageRating?(Number(a.averageRating)/10).toFixed(1):null,genres:[],synopsis:a.synopsis||'',url:`https://kitsu.app/${kind}/${a.slug||record.id}`,relations,fetchedAt:new Date().toISOString(),source:'Kitsu'};
}
async function request(path,fetcher=fetch){
  const response=await fetcher(ROOT+path,{headers:{Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error(response.status===429?'Le catalogue est très sollicité. Réessaie dans une minute.':`Catalogue indisponible (${response.status}). Réessaie plus tard.`);
  return response.json();
}
export async function searchMedia({kind='manga',query='',page=1},fetcher=fetch){
  if(!['manga','anime'].includes(kind))throw Error('Format invalide.');
  const params=new URLSearchParams({'page[limit]':'20','page[offset]':String((Math.max(1,page)-1)*20),include:'categories,genres'});
  if(query.trim())params.set('filter[text]',query.trim().slice(0,100));else params.set('sort','popularityRank');
  const result=await request(`/${kind}?${params}`,fetcher);
  return {data:result.data.filter(r=>!isExplicit(r,result.included||[])).map(r=>normalize(r,result.included||[])),hasNext:!!result.links?.next};
}
export async function getMedia(key,fetcher=fetch){
  if(!/^(manga|anime):[1-9][0-9]*$/.test(key))throw Error('Identifiant invalide.');
  const [kind,id]=key.split(':');
  const result=await request(`/${kind}/${id}?include=categories,genres,mediaRelationships.destination`,fetcher);
  if(isExplicit(result.data,result.included||[]))throw new ContentFilteredError();
  // Kitsu's polymorphic destination cannot include nested classifications.
  // Resolve only relevant relations separately and hide unverifiable destinations.
  const relevant=(result.included||[]).filter(r=>r.type==='mediaRelationships'&&['adaptation','source','prequel','sequel'].includes(r.attributes?.role));
  const destinations=[...new Map(relevant.map(r=>r.relationships?.destination?.data).filter(r=>r&&['anime','manga'].includes(r.type)).map(r=>[r.type+':'+r.id,r])).values()];
  for(let i=0;i<destinations.length;i+=4){await Promise.all(destinations.slice(i,i+4).map(async ref=>{
    let item;try{item=await request(`/${ref.type}/${ref.id}?include=categories,genres`,fetcher);}catch{item={data:{...ref,attributes:{nsfw:true}}};}
    result.included=(result.included||[]).filter(r=>!(r.id===ref.id&&r.type===ref.type));
    result.included.push(item.data,...(item.included||[]));
  }));}
  const data=normalize(result.data,result.included||[]);
  data.detailLoaded=true;
  if(kind==='anime'&&data.ongoing){
    // Only dated, already released episodes count as available.
    try{
      const episodes=await request(`/anime/${id}/episodes?sort=-number&page[limit]=20`,fetcher);
      const aired=episodes.data.filter(e=>e.attributes.airdate&&Date.parse(e.attributes.airdate)<=Date.now()).map(e=>e.attributes.number);
      data.available=aired.length?Math.max(...aired):null;
    }catch{data.available=null;}
  }
  return {data};
}
export function volumeSegments(chapters,total,finished){
  const rows=chapters.map(r=>r.attributes).sort((a,b)=>a.number-b.number);
  if(!rows.length||rows.some((r,i)=>!Number.isSafeInteger(r.number)||r.number!==i+1||!Number.isSafeInteger(r.volumeNumber)||r.volumeNumber<1||(i&&r.volumeNumber<rows[i-1].volumeNumber)))return [];
  const out=[];
  rows.forEach((r,i)=>{const next=rows[i+1];if(next&&next.volumeNumber>r.volumeNumber||!next&&finished&&r.number===total)out.push({id:'unit:'+r.volumeNumber,number:r.volumeNumber,end:r.number});});
  return out;
}
export async function getVolumes(key,fetcher=fetch){
  const {data:meta}=await getMedia(key,fetcher);if(meta.kind!=='manga')throw Error('Choisis un manga.');
  const id=key.split(':')[1],first=await request(`/manga/${id}/chapters?sort=number&page[limit]=20`,fetcher),count=first.meta?.count||first.data.length;
  if(count>3000)throw Error('Découpage indisponible. Le suivi par chapitre reste accessible.');
  const rows=[...first.data];
  for(let offset=20;offset<count;offset+=80){
    const pages=await Promise.all([offset,offset+20,offset+40,offset+60].filter(n=>n<count).map(n=>request(`/manga/${id}/chapters?sort=number&page[limit]=20&page[offset]=${n}`,fetcher)));
    pages.forEach(p=>rows.push(...p.data));
  }
  if(rows.length!==count)throw Error('Découpage incomplet. Le suivi par chapitre reste accessible.');
  return {data:volumeSegments(rows,meta.total,!meta.ongoing)};
}
export async function getSeasons(key,fetcher=fetch){
  if(!key.startsWith('anime:'))throw Error('Choisis un animé.');
  const queue=[key],seen=new Set(),found=[];
  while(queue.length&&seen.size<24){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const {data}=await getMedia(id,fetcher);if(['TV','tv','ONA','ona'].includes(data.format)||id===key)found.push(data);for(const s of data.seasons||[])if(!seen.has(s.id))queue.push(s.id);}
  found.sort((a,b)=>(a.startDate||'9999').localeCompare(b.startDate||'9999')||a.title.localeCompare(b.title));
  return {data:found,incomplete:queue.some(id=>!seen.has(id))};
}
