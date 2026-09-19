const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
  const supplied=req.headers['x-nova-key']||req.body?.adminKey||'';
  if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}

async function listComments(mediaId){
  const url=new URL(COMMENTS_API_URL);
  url.searchParams.set('action','list');
  url.searchParams.set('mediaId',String(mediaId||''));
  url.searchParams.set('_',String(Date.now()));
  const r=await fetch(url.toString(),{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{throw new Error('Server komentar tidak mengembalikan JSON. Pastikan Apps Script mengizinkan akses publik.')}
  if(!r.ok||data?.ok===false)throw new Error(data?.error||'Komentar gagal dimuat');
  return Array.isArray(data)?data:(Array.isArray(data?.comments)?data.comments:(Array.isArray(data?.items)?data.items:[]));
}

async function draftReply(comment,style='ramah'){
  if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('OPENAI_API_KEY belum disetel di Vercel'),{status:503});
  const title=String(comment.title||'').trim();
  const name=String(comment.name||'Anonim').trim();
  const text=String(comment.text||'').trim();
  if(!text)throw Object.assign(new Error('Isi komentar kosong'),{status:400});
  const input='Kamu adalah NOVA, admin komunitas NontonGratisan. Buat DRAFT balasan komentar dalam Bahasa Indonesia. Balasan 1-2 kalimat, ramah, natural, tidak mengaku sebagai manusia tertentu, tidak mengarang fakta film, tidak memberikan tautan streaming ilegal, dan jangan membahas data pribadi. Jika pertanyaan tidak bisa dijawab dari konteks, minta detail tambahan. Judul: '+title+'\nNama: '+name+'\nKomentar: '+text+'\nGaya: '+style;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input,store:false})});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error?.message||'OpenAI API gagal');
  let answer=j.output_text;
  if(!answer&&Array.isArray(j.output))answer=j.output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  if(!String(answer||'').trim())throw new Error('NOVA tidak menghasilkan draft balasan');
  return String(answer).trim();
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    auth(req);
    const action=String(req.body?.action||'list');
    if(action==='list'){
      const mediaId=String(req.body?.mediaId||'').trim();
      if(!mediaId)return res.status(400).json({error:'Media ID wajib diisi'});
      const comments=await listComments(mediaId);
      return res.status(200).json({ok:true,comments});
    }
    if(action==='draft'){
      const reply=await draftReply(req.body?.comment||{},String(req.body?.style||'ramah'));
      return res.status(200).json({ok:true,reply});
    }
    return res.status(400).json({error:'Action tidak dikenal'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}