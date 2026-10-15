import { getMedia, searchMedia } from '../../../site/catalog.mjs';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
async function upstream(url: string, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Accept': 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'Tsugi/1.0 (personal manga tracker)' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(14000) });
  if (!response.ok) throw Error(response.status === 429 ? 'Le catalogue est très sollicité. Réessaie dans une minute.' : `Source indisponible (${response.status}). Réessaie plus tard.`);
  return await response.json();
}
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
async function fresh(key: string) {
  const [kind, rawId] = key.split(':');
  const id = Number(rawId);
  if (!['manga','anime','mu'].includes(kind) || !Number.isSafeInteger(id) || id < 1) throw Error('Identifiant invalide.');
  if (kind === 'mu') {
    const d = await upstream(`https://api.mangaupdates.com/v1/series/${id}`);
    return { id: key, title: d.title, latest: positive(Number(d.latest_chapter)), url: d.url || `https://www.mangaupdates.com/series/${id}`, fetchedAt: new Date().toISOString(), source: 'MangaUpdates', publication: d.status || '' };
  }
  const data: any = (await getMedia(key, (url: string, opts: any) => fetch(url, {...opts, headers:{...opts.headers, 'User-Agent':'Tsugi/1.0'}}))).data;
  if (kind === 'manga' && data.ongoing && !data.total) {
    try {
      const result = await upstream('https://api.mangaupdates.com/v1/series/search', { search: data.title, perpage: 8 });
      const canonical = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const exact = (result.results || []).map((r: any) => r.record).filter((r: any) => canonical(r.title) === canonical(data.title));
      if (exact.length === 1) {
        const release: any = await getRecord(`mu:${exact[0].series_id}`);
        data.releaseId = release.id; data.latest = release.latest; data.release = release;
      }
    } catch { data.releaseUnavailable = true; }
  }
  return data;
}

async function getRecord(key: string) {
  const { data: cached, error } = await db.from('tsugi_catalog').select('*').eq('id', key).maybeSingle();
  if (error) throw Error('Cache du catalogue indisponible.');
  if (cached && Date.parse(cached.next_refresh) > Date.now()) return { ...cached.data, stale: !!cached.last_error };
  try {
    const data: any = await fresh(key);
    if (data.releaseUnavailable && cached?.data?.release) {
      data.release = { ...cached.data.release, stale: true };
      data.releaseId = cached.data.releaseId; data.latest = cached.data.latest;
    }
    const { error: saveError } = await db.from('tsugi_catalog').upsert({ id: key, data, next_refresh: new Date(Date.now() + 6 * 3600000).toISOString(), last_error: null });
    if (saveError) throw Error('Enregistrement du catalogue indisponible.');
    return data;
  } catch (error) {
    if (cached) {
      await db.from('tsugi_catalog').update({ last_error: String(error), next_refresh: new Date(Date.now() + 30 * 60000).toISOString() }).eq('id', key);
      return { ...cached.data, stale: true };
    }
    throw error;
  }
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return answer({ error: 'Méthode non autorisée.' }, 405);
  try {
    const input = await req.json();
    const action = input.action;
    if (action === 'refresh') {
      const secret = req.headers.get('x-tsugi-job');
      if (!secret) return answer({ error: 'Accès serveur requis.' }, 403);
      const { data } = await db.from('tsugi_job_config').select('secret').eq('id', 1).single();
      if (!data || data.secret !== secret) return answer({ error: 'Accès serveur requis.' }, 403);
    } else {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return answer({ error: 'Connexion requise.' }, 401);
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return answer({ error: 'Reconnecte-toi pour accéder au catalogue.' }, 401);
    }
    if (action === 'get') {
      if (!/^(manga|anime|mu):[1-9][0-9]{0,15}$/.test(input.id || '')) return answer({ error: 'Identifiant invalide.' }, 400);
      return answer({ data: await getRecord(input.id) });
    }
    if (action === 'search') {
      const kind = input.kind === 'anime' ? 'anime' : 'manga';
      const page = Math.max(1, Math.min(1000, Number(input.page) || 1));
      const q = String(input.query || '').trim().slice(0, 100);
      return answer(await searchMedia({kind, query:q, page}, (url: string, opts: any) => fetch(url, {...opts, headers:{...opts.headers, 'User-Agent':'Tsugi/1.0'}})));
    }
    if (action === 'muSearch') {
      const query = String(input.query || '').trim().slice(0, 100);
      if (query.length < 2) return answer({ error: 'Saisis au moins deux caractères.' }, 400);
      const result = await upstream('https://api.mangaupdates.com/v1/series/search', { search: query, perpage: 8 });
      return answer({ data: (result.results || []).slice(0,8).map((r: any) => ({ id: `mu:${r.record.series_id}`, title: r.record.title, year: r.record.year, image: r.record.image?.url?.thumb || '', url: r.record.url })) });
    }
    if (action === 'refresh') {
      // Server-only scheduled job. Claim rows atomically to avoid duplicate work.
      const { data: rows, error } = await db.rpc('tsugi_claim_refresh');
      if (error) throw Error('Actualisation indisponible.');
      const results = [];
      for (const row of rows || []) {
        try {
          const data: any = await fresh(row.id);
          if (data.releaseUnavailable && row.data?.release) {
            data.release = { ...row.data.release, stale: true };
            data.releaseId = row.data.releaseId; data.latest = row.data.latest;
          }
          const { error: updateError } = await db.from('tsugi_catalog').update({ data, last_error: null, next_refresh: new Date(Date.now() + 6 * 3600000).toISOString() }).eq('id', row.id);
          if (updateError) throw updateError;
          results.push({ id: row.id, ok: true });
        } catch (e) {
          await db.from('tsugi_catalog').update({ last_error: String(e), next_refresh: new Date(Date.now() + 30 * 60000).toISOString() }).eq('id', row.id);
          results.push({ id: row.id, ok: false });
        }
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      return answer({ results });
    }
    return answer({ error: 'Action inconnue.' }, 400);
  } catch (e) {
    return answer({ error: e instanceof Error ? e.message : 'Catalogue indisponible.' }, 502);
  }
});
