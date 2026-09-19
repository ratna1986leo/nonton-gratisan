const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
  const expected=process.env.NOVA_BOT_SECRET||process.env.NOVA_ADMIN_KEY;
  const supplied=req.headers['x-nova-bot-secret']||req.headers['x-nova-key']||req.body?.secret||'';
  if(!expected) throw Object.assign(new Error('NOVA_BOT_SECRET/NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
  if(supplied!==expected) throw Object.assign(new Error('Webhook secret salah'),{status:401});
}

async function draftReply(c){
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

async function replyToSheet(c,reply){
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

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    auth(req);
    const c=req.body?.comment||req.body||{};
    const commentId=String(c.commentId||c.id||'').trim();
    if(!commentId) return res.status(400).json({error:'Comment ID wajib diisi'});

    const reply=await draftReply(c);
    const result=await replyToSheet(c,reply);

    return res.status(200).json({ok:true,commentId,reply,result});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Bot komentar gagal'});
  }
}
