const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1yRbeSYw0PdbM_tZmjjgKd3v41B7yMMQNa-GTesgp3Lk/export?format=csv';
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.KUNCI_API_TMDB || '';

const NOVA_MIN_INTERVAL_MS = Number(process.env.NOVA_MIN_INTERVAL_MS || 1500);
const NOVA_MAX_REQUESTS_PER_WINDOW = Number(process.env.NOVA_MAX_REQUESTS_PER_WINDOW || 60);
const NOVA_RATE_WINDOW_MS = Number(process.env.NOVA_RATE_WINDOW_MS || 10 * 60 * 1000);
const novaRateStore = globalThis.__NOVA_RATE_STORE || new Map();
globalThis.__NOVA_RATE_STORE = novaRateStore;

function parseCSV(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(quoted){
      if(ch==='"' && next==='"'){cell+='"'; i++;}
      else if(ch==='"') quoted=false;
      else cell+=ch;
    }else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r') cell+=ch;
  }
  if(cell!=='' || row.length){row.push(cell);rows.push(row);}
  return rows;
}

function catalogContext(text){
  const rows=parseCSV(text);
  if(!rows.length) return {total:0,playable:0,unplayable:0,movieCount:0,seriesCount:0,items:[],playableItems:[],unplayableItems:[]};

  const columns=rows[0].map(x=>String(x||'').trim());
  const data=rows.slice(1).filter(r=>r.some(v=>String(v||'').trim()));
  const objects=data.map(r=>Object.fromEntries(columns.map((c,i)=>[c,String(r[i]??'').trim()])));

  const normKey=value=>normalizeText(value).replace(/[^a-z0-9]+/g,'');
  const findExact=(...names)=>{
    const wanted=names.map(normKey);
    return columns.find(c=>wanted.includes(normKey(c)));
  };

  // Schema Sheet NOVA saat ini:
  // Judul | Poster | Link | Genre | Tahun | Rating | Aktor | Deskripsi
  const titleKey=findExact('title','judul','name')||columns[0];
  const linkKey=findExact('link','url','video','embed','embed_url','source','player','play','play_url');
  const yearKey=findExact('year','tahun','release_year','tahun_rilis');
  const genreKey=findExact('genre','genres');

  const extractEpisode=(title)=>{
    const m=String(title||'').match(/\\b(?:episode|eps)\\s*[-.]?\\s*(\\d+)\\b/i);
    return m?m[1]:'';
  };

  const cleanSeriesTitle=(title)=>{
    return String(title||'')
      .replace(/\\s*[-–—]?\\s*(?:season|musim)\\s*\\d+\\s*(?:[-–—]?\\s*)?(?:episode|eps)\\s*[-.]?\\s*\\d+.*$/i,'')
      .replace(/\\s*[-–—]?\\s*(?:episode|eps)\\s*[-.]?\\s*\\d+.*$/i,'')
      .replace(/\\s*\\[[^\\]]*\\]\\s*$/,'')
      .trim();
  };

  const allItems=objects.map(o=>{
    const judul=o[titleKey]||'';
    const genre=genreKey?String(o[genreKey]||'').trim():'';
    const episode=extractEpisode(judul);
    const seriesHint=/\\b(?:series|serial|tv\\s*series|web\\s*series|seri)\\b/i.test(genre)
      || /\\b(?:season|musim|episode|eps)\\s*[-.]?\\s*\\d+/i.test(judul);
    const jenis=seriesHint?'series':'movie';
    const seriesTitle=jenis==='series'?cleanSeriesTitle(judul):'';

    return {
      judul,
      tahun:yearKey?o[yearKey]||'':'',
      tipe:genre,
      genre,
      jenis,
      episode,
      seriesTitle,
      bisaDiputar:Boolean(linkKey && String(o[linkKey]||'').trim())
    };
  }).filter(x=>x.judul);

  const seriesGroups=new Map();
  for(const item of allItems.filter(x=>x.jenis==='series')){
    const key=normalizeTitle(item.seriesTitle||item.judul);
    if(!seriesGroups.has(key)) seriesGroups.set(key,{judul:item.seriesTitle||item.judul,tahun:item.tahun,episodes:[]});
    seriesGroups.get(key).episodes.push(item);
  }

  const seriesList=[...seriesGroups.values()];
  return {
    total:allItems.length,
    playable:allItems.filter(x=>x.bisaDiputar).length,
    unplayable:allItems.filter(x=>!x.bisaDiputar).length,
    movieCount:allItems.filter(x=>x.jenis==='movie').length,
    seriesCount:seriesList.length,
    seriesList,
    items:allItems,
    playableItems:allItems.filter(x=>x.bisaDiputar),
    unplayableItems:allItems.filter(x=>!x.bisaDiputar)
  };
}
async function loadCatalog(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'},cache:'no-store',signal:controller.signal});
    if(!r.ok) throw new Error('Google Sheet katalog HTTP '+r.status);
    return catalogContext(await r.text());
  }finally{ clearTimeout(timer); }
}

function getClientId(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const real=String(req.headers['x-real-ip']||'').trim();
  return forwarded || real || 'shared';
}

function checkNovaRate(clientId){
  const now=Date.now();
  const prev=novaRateStore.get(clientId)||{last:0,times:[]};
  const times=prev.times.filter(t=>now-t<NOVA_RATE_WINDOW_MS);
  if(prev.last && now-prev.last<NOVA_MIN_INTERVAL_MS){
    return {ok:false,retryAfterMs:NOVA_MIN_INTERVAL_MS-(now-prev.last),reason:'interval'};
  }
  if(times.length>=NOVA_MAX_REQUESTS_PER_WINDOW){
    return {ok:false,retryAfterMs:Math.max(1000,NOVA_RATE_WINDOW_MS-(now-times[0])),reason:'window'};
  }
  novaRateStore.set(clientId,{last:now,times:[...times,now]});
  return {ok:true};
}

function normalizeText(value){
  return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function normalizeTitle(value){
  return normalizeText(value).replace(/[^a-z0-9]+/g,' ').trim();
}

function isCatalogOverviewIntent(message){
  const m=normalizeText(message);
  if(/\b(?:series|serial|tv|seri|film|movie|bioskop|player)\b/i.test(m)) return false;
  return /^(?:cek|lihat|tampilkan|ringkasan|summary)\s+(?:data\s+)?(?:pustaka|katalog)$/i.test(m)
    || /^(?:pustaka|katalog)$/i.test(m);
}

function isPlayableIntent(message){
  const m=normalizeText(message);
  return /\b(?:bisa|dapat)\s+(?:diputar|ditonton)\b/i.test(m)
    || /\b(?:status)\s+player\b/i.test(m)
    || /\bplayer\b.*\bstatus\b/i.test(m);
}

function isCatalogTypeIntent(message,type){
  const m=normalizeText(message);
  if(!/\b(?:pustaka|katalog)\b/i.test(m)) return false;
  if(type==='series') return /\b(?:series|serial|tv|seri)\b/i.test(m);
  if(type==='movie') return /\b(?:film|movie|bioskop)\b/i.test(m) && !/\b(?:series|serial|tv|seri)\b/i.test(m);
  return /\b(?:semua|seluruh)\b/i.test(m);
}

function extractCatalogSearch(message){
  const m=normalizeText(message).replace(/\bdipustaka\b/g,'di pustaka');
  const patterns=[
    /(?:cari|carikan|cek|temukan|apakah ada)\s+(?:(?:film|movie|series|serial|tv)\s+)?(.+?)\s+(?:di|dalam)\s+(?:pustaka|katalog)(?:\s+film)?$/i,
    /(?:cari|carikan|cek)\s+(?:di|dalam)\s+(?:pustaka|katalog)(?:\s+film)?\s+(?:(?:film|movie|series|serial|tv)\s+)?(.+)$/i
  ];
  for(const re of patterns){
    const hit=m.match(re);
    if(hit?.[1]){
      const q=hit[1].replace(/\s+(?:dong|bro|ya|please)$/i,'').trim();
      if(q.length>=2 && !/^(?:film|movie|series|serial|tv)$/i.test(q)) return {query:q};
    }
  }
  return null;
}

function isTMDBTrendingWeekIntent(message){
  const m=normalizeText(message);
  return /(?:\btrending\b|\btren\b).*(?:minggu\s+ini|mingguan|week)|(?:minggu\s+ini|mingguan|week).*(?:\btrending\b|\btren\b)/i.test(m);
}

function wantsTMDBSeries(message){
  return /\b(?:series|serial|tv|seri)\b/i.test(normalizeText(message));
}

function wantsTMDBMovie(message){
  return /\b(?:film|movie|bioskop)\b/i.test(normalizeText(message));
}

function isTMDBOverviewIntent(message){
  const m=normalizeText(message);
  return /^(?:cek|lihat|tampilkan|daftar|list)?\s*(?:film\s+)?(?:di\s+)?tmdb\s*$/i.test(m)
    || /^cek\s+film\s+di\s+tmdb$/i.test(m);
}

function extractTMDBSearch(message){
  const m=String(message||'').trim();
  const patterns=[
    /(?:cari|carikan|search|temukan|tolong cari|cek)\s+(?:(?:film|movie|series|serial|tv)\s+)?(.+?)\s+(?:di\s+tmdb|di\s+the movie database)$/i,
    /(?:cari|carikan|search|temukan|tolong cari)\s+(?:(?:film|movie|series|serial|tv)\s+)(.+)$/i
  ];
  for(const re of patterns){
    const hit=m.match(re);
    if(hit?.[1]){
      const q=hit[1].replace(/\s+(?:dong|bro|ya|please)$/i,'').trim();
      if(q.length>=2) return {query:q,type:wantsTMDBSeries(m)?'series':wantsTMDBMovie(m)?'film':'all'};
    }
  }
  return null;
}

async function searchTMDB(query,type='all'){
  if(!TMDB_API_KEY) return {available:false,error:'TMDB_API_KEY belum disetel'};
  const clean=String(query||'').trim();
  if(!clean) return {available:false,error:'Query TMDB kosong'};
  const endpoint=type==='series'?'tv':type==='film'?'movie':'multi';
  const url='https://api.themoviedb.org/3/search/'+endpoint+'?language=id-ID&include_adult=false&page=1&api_key='+encodeURIComponent(TMDB_API_KEY)+'&query='+encodeURIComponent(clean);
  const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw new Error('TMDB search HTTP '+r.status);
  const data=await r.json();
  const items=(Array.isArray(data.results)?data.results:[]).filter(x=>endpoint!=='multi'||x.media_type==='movie'||x.media_type==='tv').slice(0,8).map(x=>({
    tmdbId:x.id,
    tipe:(endpoint==='tv'||x.media_type==='tv')?'Series':'Film',
    judul:(endpoint==='tv'||x.media_type==='tv')?(x.name||''):(x.title||''),
    tahun:String((endpoint==='tv'||x.media_type==='tv')?x.first_air_date:x.release_date||'').slice(0,4),
    rating:typeof x.vote_average==='number'?x.vote_average.toFixed(1):'',
    poster:x.poster_path?'https://image.tmdb.org/t/p/w342'+x.poster_path:'',
    deskripsi:x.overview||''
  })).filter(x=>x.judul);
  return {available:true,items};
}

async function loadTMDBTrending(kind){
  if(!TMDB_API_KEY) return {available:false,error:'TMDB_API_KEY belum disetel',items:[]};
  const endpoint=kind==='series'?'tv':'movie';
  const url='https://api.themoviedb.org/3/trending/'+endpoint+'/week?language=id-ID&api_key='+encodeURIComponent(TMDB_API_KEY);
  const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw new Error('TMDB trending '+kind+' HTTP '+r.status);
  const data=await r.json();
  const items=(Array.isArray(data.results)?data.results:[]).slice(0,10).map(x=>({
    tmdbId:x.id,
    tipe:kind==='series'?'Series':'Film',
    judul:kind==='series'?(x.name||''):(x.title||''),
    tahun:String(kind==='series'?x.first_air_date:x.release_date||'').slice(0,4),
    rating:typeof x.vote_average==='number'?x.vote_average.toFixed(1):'',
    popularity:typeof x.popularity==='number'?x.popularity:'',
    poster:x.poster_path?'https://image.tmdb.org/t/p/w342'+x.poster_path:'',
    deskripsi:x.overview||''
  })).filter(x=>x.judul);
  return {available:true,items};
}

function formatTrending(label,items){
  const lines=items.map((x,i)=>String(i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+(x.rating?' — ⭐ '+x.rating:'')+' — TMDB ID '+x.tmdbId);
  return '📈 '+label+' yang sedang trending minggu ini di TMDB (10 teratas):\\n\\n'+(lines.length?lines.join('\\n'):'Belum ada hasil.');
}

async function getTrendingBundle(kind){
  const result=await loadTMDBTrending(kind);
  return result;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY || process.env.KUNCI_ADMIN_NOVA;
  if(!expected) return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah'});

  const rate=checkNovaRate(getClientId(req));
  if(!rate.ok){
    const retryAfter=Math.max(1,Math.ceil(rate.retryAfterMs/1000));
    res.setHeader('Retry-After',String(retryAfter));
    return res.status(429).json({
      error:'NOVA terlalu cepat menerima permintaan. Tunggu '+retryAfter+' detik.',
      retryAfterSec:retryAfter,
      reason:rate.reason
    });
  }

  const message=typeof req.body?.message==='string'?req.body.message.trim():'';
  if(!message) return res.status(400).json({error:'Pesan kosong'});
  if(message.length>1000) return res.status(400).json({error:'Pesan terlalu panjang'});

  try{
    let catalog=null;
    const ensureCatalog=async()=>{ if(!catalog) catalog=await loadCatalog(); return catalog; };
    const catalogSearch=extractCatalogSearch(message);

    if(isPlayableIntent(message)){
      await ensureCatalog();
      return res.status(200).json({
        ok:true,source:'catalog',
        reply:'▶️ Status Player Pustaka\\n\\nAda player: '+catalog.playable+' judul\\nBelum ada player: '+catalog.unplayable+' judul'
      });
    }

    // "Cek series" adalah permintaan detail: jumlah + judul + jumlah episode.
    if(/\bcek\s+(?:data\s+)?series\b/i.test(normalizeText(message))){
      await ensureCatalog();
      const seriesList=catalog.seriesList||[];
      const lines=seriesList.map((x,i)=>{
        const episodes=[...x.episodes].sort((a,b)=>(Number(a.episode)||999)-(Number(b.episode)||999));
        const epText=episodes.map(e=>'Ep '+(e.episode||'?')).join(', ');
        return (i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+' — '+episodes.length+' episode'+(epText?' — '+epText:'');
      });
      return res.status(200).json({
        ok:true,source:'catalog',items:seriesList,
        reply:'📺 Data Series di Pustaka: '+seriesList.length+' judul\\n\\n'+(lines.length?lines.join('\\n'):'Belum ada data series.')
      });
    }

    if(isCatalogOverviewIntent(message)){
      await ensureCatalog();
      return res.status(200).json({
        ok:true,source:'catalog',
        reply:'📚 Ringkasan Pustaka\\n\\n🎬 Film bioskop: '+catalog.movieCount+' judul\\n📺 Series: '+catalog.seriesCount+' judul\\n▶️ Sudah ada player: '+catalog.playable+'\\n⏳ Belum ada player: '+catalog.unplayable
      });
    }

    for(const type of ['movie','all']){
      if(isCatalogTypeIntent(message,type)){
        await ensureCatalog();
        const items=type==='movie'
          ? catalog.items.filter(x=>x.jenis==='movie')
          : catalog.items;
        const label=type==='movie'?'film bioskop':'seluruh film/series';
        const playerText='▶️ Ada player: '+items.filter(x=>x.bisaDiputar).length+' | ⏳ Belum ada player: '+items.filter(x=>!x.bisaDiputar).length;
        return res.status(200).json({
          ok:true,source:'catalog',items,
          reply:'📚 '+label+' di pustaka: '+items.length+' judul\\n'+playerText+'\\n\\n'+
            (type==='movie'?'Judul film tidak ditampilkan. Gunakan permintaan judul film tertentu bila ingin mencari judul di pustaka.':'Data seluruh pustaka hanya menampilkan jumlah, tanpa judul.')
        });
      }
    }

    if(isTMDBTrendingWeekIntent(message) || isTMDBOverviewIntent(message)){
      const wantSeries=wantsTMDBSeries(message);
      const wantMovie=wantsTMDBMovie(message);
      if(wantSeries && !wantMovie){
        const result=await getTrendingBundle('series');
        if(!result.available) return res.status(503).json({error:result.error});
        return res.status(200).json({ok:true,source:'tmdb',kind:'trending-series-week',items:result.items,reply:formatTrending('Series',result.items)});
      }
      if(wantMovie && !wantSeries){
        const result=await getTrendingBundle('movie');
        if(!result.available) return res.status(503).json({error:result.error});
        return res.status(200).json({ok:true,source:'tmdb',kind:'trending-movie-week',items:result.items,reply:formatTrending('Film',result.items)});
      }
      const [movies,series]=await Promise.all([getTrendingBundle('movie'),getTrendingBundle('series')]);
      if(!movies.available || !series.available) return res.status(503).json({error:movies.error||series.error||'TMDB tidak tersedia'});
      const movieLines=movies.items.map((x,i)=>(i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+(x.rating?' — ⭐ '+x.rating:'')+' — TMDB ID '+x.tmdbId);
      const seriesLines=series.items.map((x,i)=>(i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+(x.rating?' — ⭐ '+x.rating:'')+' — TMDB ID '+x.tmdbId);
      return res.status(200).json({
        ok:true,source:'tmdb',kind:'trending-week',items:{movies:movies.items,series:series.items},
        reply:'📈 Trending TMDB minggu ini\\n\\n🎬 FILM\\n'+(movieLines.length?movieLines.join('\\n'):'Belum ada hasil.')+'\\n\\n📺 SERIES\\n'+(seriesLines.length?seriesLines.join('\\n'):'Belum ada hasil.')
      });
    }

    if(catalogSearch){
      await ensureCatalog();
      const q=normalizeTitle(catalogSearch.query);
      const matches=catalog.items.filter(x=>normalizeTitle(x.judul).includes(q)).slice(0,12);
      if(!matches.length) return res.status(200).json({ok:true,source:'catalog',reply:'🔎 Aku tidak menemukan “'+catalogSearch.query+'” di pustaka.'});
      const lines=matches.map((x,i)=>(i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+' — '+(x.tipe||'Judul')+' — '+(x.bisaDiputar?'bisa diputar':'belum ada player'));
      return res.status(200).json({ok:true,source:'catalog',items:matches,reply:'🔎 Ditemukan di pustaka:\\n\\n'+lines.join('\\n')});
    }

    const tmdbSearch=extractTMDBSearch(message);
    if(tmdbSearch){
      const result=await searchTMDB(tmdbSearch.query,tmdbSearch.type);
      if(!result.available) return res.status(503).json({error:result.error});
      if(!result.items.length) return res.status(200).json({ok:true,source:'tmdb',reply:'🔎 Tidak ada hasil TMDB untuk “'+tmdbSearch.query+'”.'});
      const lines=result.items.map((x,i)=>(i+1)+'. '+x.judul+(x.tahun?' ('+x.tahun+')':'')+' — '+x.tipe+(x.rating?' — ⭐ '+x.rating:'')+' — TMDB ID '+x.tmdbId);
      return res.status(200).json({ok:true,source:'tmdb',items:result.items,reply:'🔎 Hasil TMDB untuk “'+tmdbSearch.query+'”:\\n\\n'+lines.join('\\n')});
    }

    return res.status(200).json({
      ok:true,
      source:'nova',
      reply:'Bro, NOVA sekarang fokus ke dua sumber data saja: 📚 Google Sheet untuk pustaka dan 📈 TMDB untuk trending mingguan film/series.\\n\\nCoba: “cek pustaka”, “film yang bisa diputar”, “film trending minggu ini”, atau “series trending minggu ini”.'
    });
  }catch(e){
    console.error('[NOVA_HANDLER_ERROR]',e);
    if(e?.name==='AbortError') return res.status(504).json({error:'Google Sheet timeout. Coba lagi sebentar.'});
    return res.status(502).json({error:'Data NOVA gagal dimuat: '+(e.message||'unknown error')});
  }
}
