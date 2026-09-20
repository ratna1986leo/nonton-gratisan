const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const SHEET_CSV_URL=process.env.GOOGLE_SHEETS_CSV_URL||'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';

function parseCSV(text){
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\\r')cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function norm(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function csvCatalog(text){
  const rows=parseCSV(text); if(!rows.length)return [];
  const cols=rows[0].map(x=>String(x||'').trim());
  const find=(...names)=>{const w=names.map(x=>x.toLowerCase());return cols.find(c=>w.includes(c.toLowerCase()));};
  const titleKey=find('title','judul','name')||cols[0];
  const yearKey=find('year','tahun');
  const genreKey=find('genre','genres','kategori');
  const linkKey=find('link','url','video','embed','source','player');
  return rows.slice(1).filter(r=>r.some(v=>String(v||'').trim())).map(r=>{
    const o=Object.fromEntries(cols.map((c,i)=>[c,String(r[i]??'').trim()]));
    return {title:o[titleKey]||'',year:o[yearKey]||'',genre:o[genreKey]||'',url:linkKey?o[linkKey]||'':''};
  }).filter(x=>x.title);
}
async function getRecommendations(c){
  try{
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),7000);
    let r; try{r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'},cache:'no-store',signal:ctrl.signal});}finally{clearTimeout(timer);}
    if(!r.ok)return [];
    const rows=csvCatalog(await r.text());
    const current=norm(c.title);
    const currentRow=rows.find(x=>norm(x.title)===current);
    const currentGenres=String(currentRow?.genre||'').split(/[,|/;]+/).map(norm).filter(Boolean);
    const playable=rows.filter(x=>x.url && norm(x.title)!==current);
    const score=x=>{
      const gs=String(x.genre||'').split(/[,|/;]+/).map(norm).filter(Boolean);
      const same=currentGenres.length&&gs.some(g=>currentGenres.some(cg=>g===cg||g.includes(cg)||cg.includes(g)));
      const year=Number.parseInt(String(x.year).slice(0,4),10)||0;
      return (same?100000:0)+year;
    };
    return playable.sort((a,b)=>score(b)-score(a)).slice(0,3);
  }catch(e){return [];}
}

const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
  const expected=process.env.NOVA_BOT_SECRET||process.env.NOVA_ADMIN_KEY;
  const supplied=req.headers['x-nova-bot-secret']||req.headers['x-nova-key']||req.body?.secret||'';
  if(!expected) throw Object.assign(new Error('NOVA_BOT_SECRET/NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
  if(supplied!==expected) throw Object.assign(new Error('Webhook secret salah'),{status:401});
}

export async function draftReply(c){
  if(!process.env.OPENAI_API_KEY) throw Object.assign(new Error('OPENAI_API_KEY belum disetel di Vercel'),{status:503});
  const input=[
    'Kamu adalah NOVA, asisten komunitas NontonGratisan.',
    'Balas komentar pengunjung dalam Bahasa Indonesia.',
    'Buat 1-2 kalimat yang ramah, natural, singkat, dan relevan dengan judul film.',
    'Jangan mengaku sebagai manusia tertentu, jangan mengarang fakta, jangan memberi tautan streaming ilegal, dan jangan meminta data pribadi.',
    'Jika komentar hanya sapaan, balas secara ramah.',
    'Jika bertanya tentang ketersediaan film, jawab secara netral dan jangan menjanjikan film akan tersedia jika tidak ada informasi tersebut.',
    'Judul: '+String(c.title||''),
    'Nama: '+String(c.name||'Anonim'),
    'Komentar: '+String(c.text||'')
  ].join('\n');

  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},
    body:JSON.stringify({model:MODEL,input,store:false})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error?.message||'OpenAI API gagal');

  let a=j.output_text;
  if(!a&&Array.isArray(j.output)){
    a=j.output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  }
  if(!String(a||'').trim()) throw new Error('Balasan AI kosong');
  return String(a).trim();
}

export async function replyToSheet(c,reply){
  const fields={
    action:'reply',
    commentId:String(c.commentId||c.id||'').trim(),
    mediaId:String(c.mediaId||''),
    title:String(c.title||''),
    name:String(c.name||'Anonim'),
    text:String(c.text||''),
    reply:String(reply||'')
  };
  if(!fields.commentId) throw new Error('Comment ID tidak ditemukan');

  const r=await fetch(COMMENTS_API_URL,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(fields).toString(),
    redirect:'follow'
  });
  const text=await r.text();
  let data=null; try{data=JSON.parse(text)}catch{}
  if(!r.ok||data?.ok===false) throw new Error(data?.error||('Google Apps Script HTTP '+r.status));
  return data||{ok:true};
}

export async function generateReply(c){
  let reply=await draftReply(c);
  const wantsRec=/rekomendasi|film lain|mirip|genre|selanjutnya|film terbaru|apa lagi|saran film/i.test(String(c.text||''));
  if(wantsRec){
    const recs=await getRecommendations(c);
    if(recs.length){
      reply += '\\n\\n🎬 Rekomendasi dari Pustaka Film:\\n' + recs.map((x,i)=>String(i+1)+'. '+x.title+(x.year?' ('+x.year+')':'')+' — '+x.url).join('\\n');
    }
  }
  return reply;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    auth(req);
    const c=req.body?.comment||req.body||{};
    const commentId=String(c.commentId||c.id||'').trim();
    if(!commentId) return res.status(400).json({error:'Comment ID wajib diisi'});

    const reply=await generateReply(c);
    const result=await replyToSheet(c,reply);

    return res.status(200).json({ok:true,commentId,reply,result});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Bot komentar gagal'});
  }
}
