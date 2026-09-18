const CSV_URL=process.env.CATALOG_CSV_URL||'https://docs.google.com/spreadsheets/d/1yRbeSYw0PdbM_tZmjjgKd3v41B7yMMQNa-GTesgp3Lk/gviz/tq?tqx=out:csv&gid=0';
const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';

function parseCSV(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
    if(c==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q}
    else if(c===','&&!q){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()))rows.push(row)}
  if(!rows.length)return[];
  const h=rows.shift().map(v=>v.trim().replace(/^\uFEFF/,'').toLowerCase());
  return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]??'').trim()])));
}
function title(x){return x.judul||x.title||x.name||'Tanpa Judul'}
function isSeries(x){const t=((x.tipe||x.type||x.jenis||'')+' '+title(x)+' '+(x.genre||'')).toLowerCase();return /series|tv|serial|drakor|k-drama|episode|season/.test(t)}
function player(x){return String(x.link||x.player||x.url||'').trim()}
function stats(items){const films=items.filter(x=>!isSeries(x)).length;const series=items.length-films;const noPlayer=items.filter(x=>!/^https?:\/\//i.test(player(x))).length;return{total:items.length,films,series,noPlayer}}
function searchItems(items,q){const terms=q.toLowerCase().split(/\s+/).filter(Boolean);return items.filter(x=>{const s=JSON.stringify(x).toLowerCase();return terms.every(t=>s.includes(t))}).slice(0,40)}
function audit(items){
  const missing={title:0,poster:0,genre:0,year:0,player:0};
  const seen=new Map();const duplicates=[];
  for(const x of items){
    const t=title(x).trim();
    if(!t||t==='Tanpa Judul')missing.title++;
    if(!(x.poster||x.poster_path||x.image||x.gambar||x.thumbnail))missing.poster++;
    if(!(x.genre||'').trim())missing.genre++;
    if(!(x.tahun||x.year||'').trim())missing.year++;
    if(!/^https?:\/\//i.test(player(x)))missing.player++;
    const key=t.toLowerCase();
    if(key&&key!=='tanpa judul'){if(seen.has(key))duplicates.push({title:t,count:seen.get(key)+1});seen.set(key,(seen.get(key)||0)+1)}
  }
  return{...stats(items),missing,duplicates:duplicates.slice(0,30),duplicateGroups:duplicates.length};
}
async function catalog(){
  const r=await fetch(CSV_URL,{cache:'no-store'});if(!r.ok)throw new Error('Katalog tidak bisa diakses: HTTP '+r.status);
  const text=await r.text();const items=parseCSV(text);if(!items.length)throw new Error('Katalog kosong atau format CSV tidak valid');return items;
}
function auth(req){const expected=process.env.NOVA_ADMIN_KEY;if(!expected)throw new Error('NOVA_ADMIN_KEY belum disetel di Vercel');const supplied=req.headers['x-nova-key'];if(!supplied||supplied!==expected){const e=new Error('Admin key salah atau belum diisi');e.status=401;throw e}}
async function askAI(message,items){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY belum disetel di Vercel');
  const matches=searchItems(items,message),s=stats(items),a=audit(items);
  const context={stats:s,audit:a,matches};
  const instructions='Kamu adalah NOVA, asisten admin untuk situs katalog film/series. Jawab dalam Bahasa Indonesia, singkat dan praktis. Gunakan hanya data katalog yang diberikan. Jika data tidak cukup, katakan tidak tahu. Jangan mengarang metadata. Kamu boleh membantu analisis, pencarian, kualitas data, SEO, dan pekerjaan administratif yang sah. Jangan membantu mencari atau menyediakan salinan ilegal atau tautan streaming yang tidak berizin. Untuk perubahan data, jelaskan bahwa perubahan harus dikonfirmasi sebelum dijalankan.';
  const input=instructions+'\n\nDATA KATALOG:\n'+JSON.stringify(context)+'\n\nPERTANYAAN ADMIN:\n'+message;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input,store:false})});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'OpenAI API gagal');
  let answer=j.output_text;
  if(!answer&&Array.isArray(j.output))answer=j.output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  if(!answer)answer='NOVA tidak menerima jawaban teks dari model.';
  return{answer,stats:s,audit:a};
}
module.exports=async function(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    auth(req);
    const action=req.body?.action||'chat';
    const items=await catalog();
    if(action==='ping')return res.status(200).json({ok:true});
    if(action==='catalog_summary')return res.status(200).json(stats(items));
    if(action==='catalog_audit')return res.status(200).json(audit(items));
    if(action==='chat'){
      const message=String(req.body?.message||'').trim();if(!message)return res.status(400).json({error:'Pesan kosong'});
      return res.status(200).json(await askAI(message,items));
    }
    return res.status(400).json({error:'Action tidak dikenal'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'})}
};