const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

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
  const items=objects.slice(0,500).map(o=>({
    judul:o[titleKey]||'',
    tahun:yearKey?o[yearKey]||'':'',
    tipe:typeKey?o[typeKey]||'':'',
    bisaDiputar:Boolean(linkKey && String(o[linkKey]||'').trim())
  })).filter(x=>x.judul);
  return {total:objects.length,playable:items.filter(x=>x.bisaDiputar).length,unplayable:items.filter(x=>!x.bisaDiputar).length,items};
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
  }).filter(Boolean).slice(0,100);
  return {available:true,source:'TMDB',items};
}

async function loadCatalog(){
  const r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'},cache:'no-store'});
  if(!r.ok) throw new Error('Google Sheet katalog HTTP '+r.status);
  return catalogContext(await r.text());
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected) return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY belum disetel di Vercel'});
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
    const wantsTMDB=/\\btmdb\\b|the movie database|database film/i.test(message);
    if(wantsTMDB){
      try{ tmdb=await loadTMDBDiscovery(); }
      catch(e){ tmdb={available:false,source:'TMDB',items:[],error:e.message}; }
    }
    const tmdbBlock=tmdb.available
      ? JSON.stringify(tmdb)
      : 'DATA TMDB TIDAK DIMUAT UNTUK PERTANYAAN INI. Jangan mengarang data TMDB.';
    const instructions=[
      'Kamu adalah NOVA, asisten admin NontonGratisan.',
      'Kamu memiliki dua sumber data yang WAJIB dipisahkan: TMDB dan PUSTAKA FILM.',
      'TMDB = metadata/discovery dari The Movie Database. PUSTAKA FILM = data yang tersimpan di Google Sheet katalog website.',
      'Jangan pernah menggabungkan, menghapus duplikasi, atau menganggap item TMDB otomatis menjadi item PUSTAKA FILM.',
      'Jika judul yang sama ada di kedua sumber, tetap laporkan sebagai dua sumber terpisah dan jelaskan apakah judul tersebut tercatat di pustaka.',
      'Kamu memiliki akses READ-ONLY ke katalog website.'
      'Gunakan hanya DATA KATALOG di bawah. Jangan mengarang judul, jumlah, atau status player.',
      'bisaDiputar=true berarti kolom Link/Player pada katalog terisi. bisaDiputar=false berarti belum ada Link/Player tercatat.',
      'Jika ditanya film yang bisa diputar, gunakan hanya bisaDiputar=true.',
      'Jika ditanya film TMDB yang belum bisa diputar, gunakan bisaDiputar=false dan jelaskan bahwa player belum tercatat.',
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

    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:MODEL,
        store:false,
        instructions,
        input:message
      })
    });
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'OpenAI request gagal'});
    const reply = typeof data.output_text==='string' && data.output_text.trim() ? data.output_text.trim() : (Array.isArray(data.output) ? data.output.flatMap(item=>Array.isArray(item?.content)?item.content.map(part=>typeof part?.text==='string'?part.text:(typeof part?.value==='string'?part.value:'')):[]).filter(Boolean).join('\n').trim() : '');
    if(!reply) return res.status(502).json({error:'OpenAI berhasil merespons, tetapi teks jawaban NOVA tidak ditemukan.'});
    return res.status(200).json({ok:true,reply});
  }catch(e){
    return res.status(500).json({error:'NOVA error: '+(e.message||'unknown error')});
  }
}