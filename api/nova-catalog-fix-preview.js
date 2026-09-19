const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

function parseCSV(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(quoted){ if(ch==='"'&&next==='"'){cell+='"';i++;} else if(ch==='"') quoted=false; else cell+=ch; }
    else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r') cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
const cleanTitle=s=>String(s??'')
  .replace(/^\s*nonton\s+/i,'')
  .replace(/\s+sub\s+indo\s*$/i,'')
  .replace(/\s+episode\s+\d+.*$/i,'')
  .replace(/\s+-\s*season\s+\d+.*$/i,'')
  .replace(/\s+season\s+\d+.*$/i,'')
  .replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/i,'')
  .trim();

function read(text){
  const rows=parseCSV(text); if(!rows.length)return {columns:[],objects:[]};
  const columns=rows[0].map(x=>String(x??'').trim());
  const objects=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((r,i)=>({rowNumber:i+2,data:Object.fromEntries(columns.map((c,j)=>[c,String(r[j]??'').trim()]))}));
  return {columns,objects};
}
function esc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function yearFromTitle(title){
  const m=String(title||'').match(/\b(?:19|20)\d{2}\b/);
  return m?m[0]:'';
}
function pickText(obj){
  return obj?.overview || '';
}
async function tmdbSearch(title){
  if(!TMDB_API_KEY)return null;
  const q=encodeURIComponent(cleanTitle(title));
  const url='https://api.themoviedb.org/3/search/multi?api_key='+encodeURIComponent(TMDB_API_KEY)+'&query='+q+'&language=id-ID&include_adult=false';
  const r=await fetch(url,{headers:{accept:'application/json'}});
  if(!r.ok)return null;
  const d=await r.json();
  const results=Array.isArray(d.results)?d.results:[];
  return results.find(x=>x.media_type==='movie'||x.media_type==='tv')||null;
}
async function tmdbDetails(item){
  if(!TMDB_API_KEY||!item?.id||!item?.media_type)return null;
  const url='https://api.themoviedb.org/3/'+item.media_type+'/'+item.id+'?api_key='+encodeURIComponent(TMDB_API_KEY)+'&language=id-ID';
  const r=await fetch(url,{headers:{accept:'application/json'}});
  if(!r.ok)return null;
  return await r.json();
}
function metadataFrom(item,details){
  if(!item)return null;
  const d=details||item;
  const isTv=item.media_type==='tv';
  const year=(isTv?d.first_air_date:d.release_date||'')?.slice(0,4)||'';
  const genres=Array.isArray(d.genres)?d.genres.map(x=>x.name).filter(Boolean).join(', '):'';
  const actors=Array.isArray(d.credits?.cast)?d.credits.cast.slice(0,8).map(x=>x.name).filter(Boolean).join(', '):'';
  return {
    type:item.media_type,
    title:isTv?(d.name||item.name||''):(d.title||item.title||''),
    year,
    rating:typeof d.vote_average==='number'?d.vote_average.toFixed(1):'',
    genre:genres,
    actor:actors,
    description:pickText(d)
  };
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected)return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  const supplied=(req.body&&typeof req.body==='object'&&req.body.adminKey)||req.headers['x-nova-key']||'';
  if(supplied!==expected)return res.status(401).json({error:'Admin key salah'});
  try{
    const selected=Array.isArray(req.body?.selections)?req.body.selections:[];
    if(!selected.length)return res.status(400).json({error:'Tidak ada temuan yang dipilih'});
    const r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'}});
    if(!r.ok)throw new Error('Google Sheet HTTP '+r.status);
    const {columns,objects}=read(await r.text());
    const find=(...names)=>{const wanted=names.map(norm);return columns.find(c=>wanted.includes(norm(c)))};
    const titleKey=find('title','judul','name')||columns[0];
    const linkKey=find('link','url','video','embed','source');
    const genreKey=find('genre');
    const yearKey=find('year','tahun');
    const actorKey=find('actor','actors','aktor');
    const descKey=find('description','deskripsi','sinopsis');
    const byRow=new Map(objects.map(o=>[o.rowNumber,o]));
    const proposals=[];
    for(const sel of selected.slice(0,50)){
      const row=Number(sel.row), type=String(sel.type||'');
      const obj=byRow.get(row);
      if(!obj)continue;
      const d=obj.data, title=d[titleKey]||'';
      let field='', oldValue='', proposed='', status='REVIEW MANUAL', source='manual';
      if(type==='missing-actor'){field=actorKey||'Aktor';oldValue=d[actorKey]||'';proposed='Cari metadata terverifikasi dari TMDB';}
      else if(type==='missing-description'){field=descKey||'Deskripsi';oldValue=d[descKey]||'';proposed='Cari sinopsis terverifikasi dari TMDB';}
      else if(type==='missing-genre'){field=genreKey||'Genre';oldValue=d[genreKey]||'';proposed='Cari genre terverifikasi dari TMDB';}
      else if(type==='missing-year'){field=yearKey||'Tahun';oldValue=d[yearKey]||'';proposed='Cari tahun rilis terverifikasi dari TMDB';}
      else if(type==='missing-link'){field=linkKey||'Link';oldValue=d[linkKey]||'';proposed='Tidak ada URL otomatis — harus diverifikasi dari sumber/embed yang sah';}
      else if(type==='duplicate-link'){field=linkKey||'Link';oldValue=d[linkKey]||'';proposed='Tidak ada penggantian otomatis — cek kepemilikan link untuk episode ini';}
      else if(type==='year-conflict'){
        field=yearKey||'Tahun';oldValue=d[yearKey]||'';
        const m=title.match(/\b(?:19|20)\d{2}\b/);
        proposed=m?'Perlu verifikasi terhadap tahun pada judul ('+m[0]+')':'Tidak ada usulan otomatis';
      }
      else if(type==='missing-title'){field=titleKey||'Judul';oldValue=title;proposed='Tidak ada nilai otomatis — perlu metadata terverifikasi';}
      else if(type==='empty-column'){field='Kolom tanpa nama';oldValue='';proposed='Jangan hapus otomatis — tinjau struktur Sheet';}
      else {field=type||'Temuan';oldValue='';proposed='Tidak ada usulan otomatis';}
      
      let meta=null;
      if(['missing-actor','missing-description','missing-genre','missing-year'].includes(type) && TMDB_API_KEY && title){
        try{
          const hit=await tmdbSearch(title);
          if(hit){
            const details=await tmdbDetails(hit);
            meta=metadataFrom(hit,details);
            if(meta){
              const value=type==='missing-actor'?meta.actor:type==='missing-description'?meta.description:type==='missing-genre'?meta.genre:meta.year;
              if(value){
                proposed=value;
                source='TMDB';
                status='REVIEW MANUAL — cocokkan dulu dengan judul/episode';
              } else {
                proposed='TMDB tidak menyediakan nilai untuk field ini';
              }
            }
          }
        }catch{}
      }
      proposals.push({row,type,title,field,oldValue,proposed,status,source,metadata:meta});
    }
    const safe=proposals.filter(x=>x.type!=='rating-check');
    return res.status(200).json({ok:true,readOnly:true,count:safe.length,proposals:safe,tmdbAvailable:Boolean(TMDB_API_KEY)});
  }catch(e){return res.status(502).json({error:'Preview nilai gagal: '+(e.message||'unknown error')});}
}