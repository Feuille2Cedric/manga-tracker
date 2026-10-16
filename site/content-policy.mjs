export const CONTENT_POLICY=2;
const explicit=/(?:^|[^a-z])(?:hentai|porn(?:ography|ographic)?|pornographie|erotica|erotic|erotique|smut|explicit[ -]?sex)(?:$|[^a-z])|^adult(?:[ -]content)?$/i;
export class ContentFilteredError extends Error {constructor(){super('Ce contenu est exclu du catalogue.');this.code='CONTENT_FILTERED';}}
export function explicitText(text){return explicit.test(String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,''));}
export function isExplicit(record,included=[]){
  const a=record?.attributes||{};
  if(a.nsfw===true||String(a.ageRating).toUpperCase()==='R18'||explicitText(a.ageRatingGuide))return true;
  for(const rel of ['categories','genres']){
    for(const ref of record.relationships?.[rel]?.data||[]){
      const tag=included.find(x=>x.id===ref.id&&x.type===ref.type)?.attributes;
      if(tag&&[tag.slug,tag.name,tag.title,...Object.values(tag.titles||{})].some(explicitText))return true;
    }
  }
  return explicitText(a.canonicalTitle);
}
export function isExplicitUpdate(record){return explicitText(record.title)||(record.genres||[]).some(g=>explicitText(g.genre||g.name))||(record.categories||[]).some(g=>explicitText(g.category||g.name));}
