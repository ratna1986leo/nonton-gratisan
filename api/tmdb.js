const ALLOWED_PATH=/^\/3\/(trending\/all\/week|discover\/(movie|tv)|search\/(movie|tv)|(?:movie|tv)\/\d+(?:\/videos)?)$/;

export default async function handler(req,res){
  try{
    if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
    const key=String(process.env.TMDB_API_KEY||'').trim();
    if(!key) return res.status(500).json({error:'TMDB_API_KEY belum disetel di Vercel'});
    const raw=String(req.query?.path||'');
    const path=raw.startsWith('/')?raw:'/'+raw;
    if(!ALLOWED_PATH.test(path)) return res.status(400).json({error:'TMDB path tidak diizinkan'});
    const params=new URLSearchParams();
    for(const [k,v] of Object.entries(req.query||{})){
      if(k==='path'||Array.isArray(v)||v==null) continue;
      if(!['language','query','page','include_adult','sort_by','with_genres','primary_release_year','first_air_date_year'].includes(k)) continue;
      params.set(k,String(v));
    }
    if(!params.has('language')) params.set('language','id-ID');
    params.set('api_key',key);
    const url='https://api.themoviedb.org'+path+'?'+params.toString();
    const r=await fetch(url,{cache:'no-store'});
    const text=await r.text();
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.status(r.status).send(text);
  }catch(e){return res.status(500).json({error:e.message||'TMDB proxy gagal'})}
}
