const ROOT='https://kitsu.app/api/edge';
const positive=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
export function normalize(record,included=[]){
  const a=record.attributes||{},kind=record.type;
  const find=ref=>included.find(r=>r.id===ref?.id&&r.type===ref?.type);
  const relations=(record.relationships?.mediaRelationships?.data||[]).map(find).filter(r=>r&&['adaptation','source'].includes(r.attributes?.role)).map(r=>find(r.relationships?.destination?.data)).filter(r=>r&&['anime','manga'].includes(r.type)).map(r=>({id:`${r.type}:${r.id}`,kind:r.type,title:r.attributes.canonicalTitle}));
  return {id:`${kind}:${record.id}`,kind,title:a.canonicalTitle||a.titles?.en_jp||a.titles?.en||'Sans titre',alternate:a.titles?.en||'',image:a.posterImage?.large||a.posterImage?.medium||'',total:positive(kind==='manga'?a.chapterCount:a.episodeCount),ongoing:a.status!=='finished',publication:({current:'En cours de publication',finished:'Terminé',upcoming:'À paraître',unreleased:'À paraître',tba:'À confirmer'})[a.status]||a.status||'',format:a.subtype||kind,score:a.averageRating?(Number(a.averageRating)/10).toFixed(1):null,genres:[],synopsis:a.synopsis||'',url:`https://kitsu.app/${kind}/${a.slug||record.id}`,relations,fetchedAt:new Date().toISOString(),source:'Kitsu'};
}
async function request(path,fetcher=fetch){
  const response=await fetcher(ROOT+path,{headers:{Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error(response.status===429?'Le catalogue est très sollicité. Réessaie dans une minute.':`Catalogue indisponible (${response.status}). Réessaie plus tard.`);
  return response.json();
}
export async function searchMedia({kind='manga',query='',page=1},fetcher=fetch){
  if(!['manga','anime'].includes(kind))throw Error('Format invalide.');
  const params=new URLSearchParams({'page[limit]':'20','page[offset]':String((Math.max(1,page)-1)*20)});
  if(query.trim())params.set('filter[text]',query.trim().slice(0,100));else params.set('sort','popularityRank');
  const result=await request(`/${kind}?${params}`,fetcher);
  return {data:result.data.map(r=>normalize(r,result.included||[])),hasNext:!!result.links?.next};
}
export async function getMedia(key,fetcher=fetch){
  if(!/^(manga|anime):[1-9][0-9]*$/.test(key))throw Error('Identifiant invalide.');
  const [kind,id]=key.split(':');
  const result=await request(`/${kind}/${id}?include=mediaRelationships.destination`,fetcher);
  const data=normalize(result.data,result.included||[]);
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
