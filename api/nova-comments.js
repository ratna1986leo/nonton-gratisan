const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
 const expected=process.env.NOVA_ADMIN_KEY;
 if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
 const supplied=req.headers['x-nova-key']||req.body?.adminKey||'';
 if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
async function callComments(fields){
 const r=await fetch(COMMENTS_API_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString(),redirect:'follow'});
 const text=await r.text(); let data=null; try{data=JSON.parse(text)}catch{}
 if(!r.ok)throw new Error(data?.error||('Server komentar HTTP '+r.status));
 if(data?.ok===false)throw new Error(data.error||'Server komentar menolak permintaan');
 return data||{ok:true,raw:text};
}
async function listComments(mediaId){
 const u=new URL(COMMENTS_API_URL);u.searchParams.set('action','list');u.searchParams.set('mediaId',String(mediaId));u.searchParams.set('_',Date.now());
 const r=await fetch(u.toString(),{cache:'no-store'});const text=await r.text();let data;
 try{data=JSON.parse(text)}catch{throw new Error('Server komentar tidak mengembalikan JSON')}
 if(!r.ok||data?.ok===false)throw new Error(data?.error||'Komentar gagal dimuat');
 return Array.isArray(data)?data:(Array.isArray(data.comments)?data.comments:(Array.isArray(data.items)?data.items:[]));
}
async function draftReply(c){
 if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('OPENAI_API_KEY belum disetel di Vercel'),{status:503});
 const input='Kamu adalah NOVA, admin komunitas NontonGratisan. Buat balasan komentar dalam Bahasa Indonesia, 1-2 kalimat, ramah dan natural. Jangan mengaku sebagai manusia tertentu, jangan mengarang fakta, jangan memberi tautan streaming ilegal, dan jangan menyebut data pribadi. Judul: '+String(c.title||'')+'\nNama: '+String(c.name||'Anonim')+'\nKomentar: '+String(c.text||'');
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input,store:false})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'OpenAI API gagal');
 let a=j.output_text;if(!a&&Array.isArray(j.output))a=j.output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');if(!String(a||'').trim())throw new Error('Draft kosong');return String(a).trim();
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{auth(req);const action=String(req.body?.action||'list');
  if(action==='list'){const mediaId=String(req.body?.mediaId||'').trim();if(!mediaId)throw Object.assign(new Error('Media ID wajib diisi'),{status:400});return res.status(200).json({ok:true,comments:await listComments(mediaId)});}
  if(action==='draft'){return res.status(200).json({ok:true,reply:await draftReply(req.body?.comment||{})});}
  if(action==='reply'){const c=req.body?.comment||{};const reply=String(req.body?.reply||'').trim();if(!reply)throw Object.assign(new Error('Balasan kosong'),{status:400});const commentId=String(c.commentId||c.id||'').trim();if(!commentId)throw Object.assign(new Error('Comment ID tidak ditemukan'),{status:400});
   const result=await callComments({action:'reply',commentId,mediaId:String(c.mediaId||''),title:String(c.title||''),name:String(c.name||'Anonim'),text:String(c.text||''),reply,replyText:reply});
   return res.status(200).json({ok:true,reply,result});
  }
  if(action==='auto_reply'){const c=req.body?.comment||{};const reply=await draftReply(c);const commentId=String(c.commentId||c.id||'').trim();if(!commentId)throw Object.assign(new Error('Comment ID tidak ditemukan'),{status:400});const result=await callComments({action:'reply',commentId,mediaId:String(c.mediaId||''),title:String(c.title||''),name:String(c.name||'Anonim'),text:String(c.text||''),reply,replyText:reply});return res.status(200).json({ok:true,reply,result});}
  return res.status(400).json({error:'Action tidak dikenal'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}