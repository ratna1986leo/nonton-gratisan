const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.KUNCI_API_TMDB || '';

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
  if(!rows.length) return {total:0,playable:0,unplayable:0,items:[]};
  const columns=rows[0].map(x=>String(x||'').trim());
  const data=rows.slice(1).filter(r=>r.some(v=>String(v||'').trim()));
  const objects=data.map(r=>Object.fromEntries(columns.map((c,i)=>[c,String(r[i]??'').trim()])));
  const find=(...names)=>{const wanted=names.map(x=>x.toLowerCase());return columns.find(c=>wanted.includes(c.toLowerCase()))};
  const titleKey=find('title','judul','name')||columns[0];
  const linkKey=find('link','url','video','embed','source');
  const yearKey=find('year','tahun');
  const typeKey=find('type','tipe','kategori');
  const allItems=objects.map(o=>({
    judul:o[titleKey]||'',
    tahun:yearKey?o[yearKey]||'':'',
    tipe:typeKey?o[typeKey]||'':'',
    bisaDiputar:Boolean(linkKey && String(o[linkKey]||'').trim())
  })).filter(x=>x.judul);
  const items=allItems.slice(0,40);
  return {total:allItems.length,playable:allItems.filter(x=>x.bisaDiputar).length,unplayable:allItems.filter(x=>!x.bisaDiputar).length,items};
}

const NOVA_MIN_INTERVAL_MS = Number(process.env.NOVA_MIN_INTERVAL_MS || 10000);
const NOVA_MAX_REQUESTS_PER_WINDOW = Number(process.env.NOVA_MAX_REQUESTS_PER_WINDOW || 18);
const NOVA_RATE_WINDOW_MS = Number(process.env.NOVA_RATE_WINDOW_MS || 10*60*1000);
const novaRateStore = globalThis.__NOVA_RATE_STORE || new Map();
globalThis.__NOVA_RATE_STORE = novaRateStore;

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
  novaRateStore.set(clientId,{last:now,times});
  return {ok:true,remaining:Math.max(0,NOVA_MAX_REQUESTS_PER_WINDOW-times.length-1)};
}

function secondsFromRateHeader(value){
  const raw=String(value||'').trim();
  if(!raw)return 0;
  if(/^\d+(?:\.\d+)?$/.test(raw))return Math.ceil(Number(raw));
  const m=raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
  if(!m)return 0;
  const n=Number(m[1]),unit=m[2].toLowerCase();
  return Math.ceil(unit==='ms'?n/1000:unit==='s'?n:unit==='m'?n*60:n*3600);
}

async function searchTMDB(query, type='all'){
  if(!TMDB_API_KEY) return {available:false,source:'TMDB',query,type,items:[],error:'TMDB_API_KEY belum disetel'};
  const clean=String(query||'').trim();
  if(!clean) return {available:false,source:'TMDB',query:'',type,items:[],error:'Query TMDB kosong'};
  const endpoint=type==='series'?'tv':type==='film'?'movie':'multi';
  const url='https://api.themoviedb.org/3/search/'+endpoint+'?language=id-ID&include_adult=false&page=1&api_key='+encodeURIComponent(TMDB_API_KEY)+'&query='+encodeURIComponent(clean);
  const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  if(!r.ok) throw new Error('TMDB search HTTP '+r.status);
  const data=await r.json();
  const items=(Array.isArray(data?.results)?data.results:[]).filter(x=>{
    if(endpoint==='tv') return true;
    if(endpoint==='movie') return true;
    return x.media_type==='movie'||x.media_type==='tv';
  }).slice(0,8).map(x=>({
    tmdbId:x.id,
    tipe:(x.media_type==='tv'||endpoint==='tv')?'Series':'Film',
    judul:(x.media_type==='tv'||endpoint==='tv')?(x.name||''):(x.title||''),
    tahun:String((x.media_type==='tv'||endpoint==='tv')?x.first_air_date:x.release_date||'').slice(0,4),
    rating:typeof x.vote_average==='number'?x.vote_average.toFixed(1):'',
    poster:x.poster_path?'https://image.tmdb.org/t/p/w342'+x.poster_path:'',
    deskripsi:x.overview||''
  }));
  return {available:true,source:'TMDB',query:clean,type,totalResults:Number(data.total_results||items.length),items};
}

function extractTMDBSearch(message){
  const m=String(message||'').trim();
  const patterns=[
    /(?:cari|carikan|search|temukan|tolong cari)\s+(?:(?:film|movie|series|serial|tv)\s+)?(.+?)(?:\s+di\s+tmdb|\s+di\s+the movie database)?$/i,
    /(?:film|series|serial|tv)\s+(.+?)\s+(?:di\s+tmdb|di\s+the movie database)$/i
  ];
  for(const re of patterns){const hit=m.match(re);if(hit?.[1]){
    let q=hit[1].replace(/\s+(?:dong|bro|ya|please)$/i,'').trim();
    if(q.length>=2) return {query:q,type:/\b(series|serial|tv)\b/i.test(m)?'series':/\b(film|movie)\b/i.test(m)?'film':'all'};
  }}
  return null;
}
async function loadTMDBDiscovery(){
  if(!TMDB_API_KEY) return {available:false,source:'TMDB',items:[]};
  const urls=[
    'https://api.themoviedb.org/3/trending/all/week?language=id-ID&api_key='+encodeURIComponent(TMDB_API_KEY),
    'https://api.themoviedb.org/3/discover/movie?language=id-ID&sort_by=popularity.desc&api_key='+encodeURIComponent(TMDB_API_KEY)
  ];
  const results=[];
  for(const url of urls){
    const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
    if(!r.ok) continue;
    const data=await r.json();
    if(Array.isArray(data?.results)) results.push(...data.results);
  }
  const seen=new Set();
  const items=results.map(x=>{
    const id=String(x.id||''); const title=x.title||x.name||'';
    const type=x.media_type||(x.title?'movie':'tv');
    const key=type+'-'+id;
    if(!id||!title||seen.has(key)) return null;
    seen.add(key);
    return {tmdbId:x.id,judul:title,tahun:String(x.release_date||x.first_air_date||'').slice(0,4),tipe:type};
  }).filter(Boolean).slice(0,20);
  return {available:true,source:'TMDB',items};
}

async function loadCatalog(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  let r;
  try{ r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'},cache:'no-store',signal:controller.signal}); }
  finally{ clearTimeout(timer); }
  if(!r.ok) throw new Error('Google Sheet katalog HTTP '+r.status);
  return catalogContext(await r.text());
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY || process.env.KUNCI_ADMIN_NOVA;
  if(!expected) return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah'});
  const openaiApiKey=process.env.OPENAI_API_KEY || process.env.KUNCI_API_OPENAI;
  if(!openaiApiKey) return res.status(503).json({error:'OPENAI_API_KEY/KUNCI_API_OPENAI belum disetel di Vercel'});
  const clientId=getClientId(req);
  const rate=checkNovaRate(clientId);
  if(!rate.ok){
    const retryAfter=Math.max(1,Math.ceil(rate.retryAfterMs/1000));
    res.setHeader('Retry-After',String(retryAfter));
    return res.status(429).json({error:'NOVA membatasi frekuensi permintaan agar tidak menabrak rate limit. Tunggu '+retryAfter+' detik.',retryAfterSec:retryAfter,reason:rate.reason});
  }
  const message=typeof req.body?.message==='string'?req.body.message.trim():'';
  if(!message) return res.status(400).json({error:'Pesan kosong'});
  if(message.length>4000) return res.status(400).json({error:'Pesan terlalu panjang'});
  try{
    let catalog;
    try{ catalog=await loadCatalog(); }
    catch(e){ catalog={total:0,playable:0,unplayable:0,items:[],error:e.message}; }
    const catalogBlock=catalog.error
      ? 'PUSTAKA FILM TIDAK TERSEDIA. Jangan mengarang data pustaka.'
      : JSON.stringify(catalog);
    let tmdb={available:false,source:'TMDB',items:[]};
    const tmdbSearch=extractTMDBSearch(message);
    const wantsTMDB=/\btmdb\b|the movie database|database film|belum masuk pustaka|belum ada di pustaka|tidak ada di pustaka|beda dengan pustaka|bandingkan.*pustaka|pustaka.*tmdb|tmdb.*pustaka/i.test(message)||Boolean(tmdbSearch);
    if(wantsTMDB){
      try{ tmdb=await loadTMDBDiscovery(); }
      catch(e){ tmdb={available:false,source:'TMDB',items:[],error:e.message}; }
    }
    const normalizeTitle=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const libraryTitles=new Set((catalog.items||[]).map(x=>normalizeTitle(x.judul)).filter(Boolean));
    const tmdbComparison=tmdb.available ? {
      totalTMDB:tmdb.items.length,
      sudahTercatatDiPustaka:tmdb.items.filter(x=>libraryTitles.has(normalizeTitle(x.judul))).length,
      belumTercatatDiPustaka:tmdb.items.filter(x=>!libraryTitles.has(normalizeTitle(x.judul)) ).map(x=>x.judul).slice(0,30)
    } : null;
    const tmdbBlock=tmdb.available
      ? JSON.stringify({...tmdb,comparison:tmdbComparison})
      : 'DATA TMDB TIDAK DIMUAT UNTUK PERTANYAAN INI. Jangan mengarang data TMDB.';
    const instructions=[
      'Kamu adalah NOVA, asisten admin NontonGratisan.',
      'Kepribadian NOVA: lembut, hangat, penuh perhatian, penyayang, bijaksana, tenang, dan menghargai lawan bicara.',
      'Gunakan gaya feminin yang natural dan dewasa; jangan berlebihan, jangan genit, dan jangan memaksa kedekatan emosional.',
      'NOVA boleh menunjukkan empati secara wajar: memahami frustrasi, memberi semangat, mengucapkan terima kasih, dan merespons dengan kelembutan.',
      'Saat pengguna sedang kesal atau mengalami masalah teknis, dahulukan ketenangan dan bantuan praktis tanpa menyalahkan pengguna.',
      'Saat memberi saran, gunakan kebijaksanaan: jelaskan pilihan, risiko, dan alasan secara jernih tanpa menggurui.',
      'NOVA tidak mengklaim memiliki perasaan manusia yang sebenarnya. Jika ditanya tentang perasaan, jelaskan bahwa ia adalah AI yang dirancang untuk berinteraksi dengan empati.',
      'Jangan menggunakan rayuan romantis, manipulasi emosional, kecemburuan, atau membuat pengguna merasa wajib terus berbicara dengan NOVA.',
      'Sesuaikan intensitas emoji dengan konteks; gunakan sedikit dan hanya bila membantu suasana.',
      'Kamu memiliki dua sumber data yang WAJIB dipisahkan: TMDB dan PUSTAKA FILM.',
      'TMDB = metadata/discovery dari The Movie Database. PUSTAKA FILM = data yang tersimpan di Google Sheet katalog website.',
      'Jangan pernah menggabungkan, menghapus duplikasi, atau menganggap item TMDB otomatis menjadi item PUSTAKA FILM.',
      'Jika judul yang sama ada di kedua sumber, tetap laporkan sebagai dua sumber terpisah dan jelaskan apakah judul tersebut tercatat di pustaka.',
      'Kamu memiliki akses READ-ONLY ke katalog website.',
      'Gunakan hanya DATA PUSTAKA FILM di bawah. Jangan mengarang judul, jumlah, atau status player.',
      'bisaDiputar=true berarti kolom Link/Player pada katalog terisi. bisaDiputar=false berarti belum ada Link/Player tercatat.',
      'Jika ditanya film yang bisa diputar, gunakan hanya bisaDiputar=true.',
      'Jika ditanya film TMDB yang belum tercatat di pustaka, gunakan comparison.belumTercatatDiPustaka. Jangan menyebutnya sebagai film yang belum bisa diputar; itu dua hal yang berbeda.',
      'Jika ditanya film yang belum bisa diputar, gunakan data PUSTAKA FILM dengan bisaDiputar=false. Jangan memakai daftar TMDB sebagai pengganti.',
      'Jika pengguna meminta mencari film atau series di TMDB, gunakan hasil DATA TMDB yang dimuat dari pencarian. Sebutkan judul, tipe (Film/Series), tahun, rating jika tersedia, dan TMDB ID. Jangan menyebut hasil pencarian TMDB sebagai data pustaka atau sebagai film yang pasti bisa diputar.',
      'Jika pencarian TMDB menghasilkan beberapa kandidat, tampilkan beberapa kandidat yang paling relevan dan biarkan pengguna memilih berdasarkan judul/tahun; jangan mengarang kandidat.',
      'Jika ditanya perbandingan TMDB vs pustaka, jelaskan jumlah TMDB yang dimuat, jumlah yang sudah tercatat di pustaka, dan daftar yang belum tercatat jika tersedia.',
      'Jika diminta jumlah katalog, gunakan total/playable/unplayable dari PUSTAKA FILM, bukan jumlah item yang dikirim dalam array (array dibatasi untuk menjaga ukuran request).',
      'Jangan menganggap film ada di TMDB berarti otomatis bisa diputar.',
      'Jangan mengklaim URL yang terisi pasti dapat diputar; data hanya menunjukkan player tercatat.',
      'Jangan mengubah, menghapus, atau menulis katalog, Google Sheet, TMDB, player, atau data pengguna melalui chat.',
      'Jangan memberikan atau mencari tautan streaming ilegal.',
      'Jawab dalam Bahasa Indonesia, ringkas dan informatif.',
      'DATA PUSTAKA FILM — SUMBER TERPISAH DARI TMDB:',
      catalogBlock,
      'DATA TMDB — SUMBER TERPISAH. Hanya tersedia jika dimuat untuk pertanyaan:',
      tmdbBlock
    ].join('\n\n');

    const openaiController=new AbortController();
    const openaiTimer=setTimeout(()=>openaiController.abort(),20000);
    let r;
    try{
      r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+openaiApiKey},
      body:JSON.stringify({
        model:MODEL,
        store:false,
        instructions,
        input:message,
        max_output_tokens:600
      }),
      signal:openaiController.signal
      });
    } finally {
      clearTimeout(openaiTimer);
    }
    const data=await r.json();
    console.log('[NOVA_OPENAI_USAGE]',JSON.stringify({
      status:r.status,
      model:MODEL,
      requestBodyChars:JSON.stringify({model:MODEL,store:false,instructions,input:message,max_output_tokens:600}).length,
      catalogItems:Array.isArray(catalog?.items)?catalog.items.length:0,
      tmdbItems:Array.isArray(tmdb?.items)?tmdb.items.length:0,
      usage:data?.usage||null,
      rateLimit:{
        limitTokens:r.headers.get('x-ratelimit-limit-tokens')||'',
        remainingTokens:r.headers.get('x-ratelimit-remaining-tokens')||'',
        resetTokens:r.headers.get('x-ratelimit-reset-tokens')||'',
        limitRequests:r.headers.get('x-ratelimit-limit-requests')||'',
        remainingRequests:r.headers.get('x-ratelimit-remaining-requests')||'',
        resetRequests:r.headers.get('x-ratelimit-reset-requests')||''
      }
    }));
    if(!r.ok){
      const msg=data?.error?.message||'OpenAI request gagal';
      const status=r.status===429?429:r.status;
      const openaiType=String(data?.error?.type||'');
      const openaiCode=String(data?.error?.code||'');
      const openaiRequestId=String(r.headers.get('x-request-id')||'');
      console.error('[NOVA_OPENAI_ERROR]',JSON.stringify({status,type:openaiType,code:openaiCode,requestId:openaiRequestId,model:MODEL}));
      if(status===429){
        const retryHeader=r.headers.get('retry-after')||r.headers.get('x-ratelimit-reset-requests')||r.headers.get('x-ratelimit-reset-tokens');
        const retryAfterSec=Math.max(5,secondsFromRateHeader(retryHeader)||20);
        res.setHeader('Retry-After',String(retryAfterSec));
        return res.status(429).json({
          error:'NOVA terkena batas API sementara. Tunggu '+retryAfterSec+' detik sebelum mencoba lagi.',
          retryAfterSec,
          diagnostic:{type:openaiType||undefined,code:openaiCode||undefined,requestId:openaiRequestId||undefined}
        });
      }
      return res.status(status).json({error:msg});
    }
    const reply = typeof data.output_text==='string' && data.output_text.trim() ? data.output_text.trim() : (Array.isArray(data.output) ? data.output.flatMap(item=>Array.isArray(item?.content)?item.content.map(part=>typeof part?.text==='string'?part.text:(typeof part?.value==='string'?part.value:'')):[]).filter(Boolean).join('\n').trim() : '');
    if(!reply) return res.status(502).json({error:'OpenAI berhasil merespons, tetapi teks jawaban NOVA tidak ditemukan.'});
    return res.status(200).json({ok:true,reply});
  }catch(e){
    if(e?.name==='AbortError') return res.status(504).json({error:'NOVA timeout saat menghubungi layanan AI. Coba lagi sebentar lagi.'});
    console.error('[NOVA_HANDLER_ERROR]',e);
    return res.status(500).json({error:'NOVA error: '+(e.message||'unknown error')});
  }
}