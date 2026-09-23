const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
 const expected=process.env.NOVA_ADMIN_KEY;
 if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
 const supplied=req.headers['x-nova-key']||req.body?.adminKey||'';
 if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
async function listFromSheet(params={},req={}){
 const u=new URL(COMMENTS_API_URL);
 Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));});
 u.searchParams.set('_',Date.now());
 const r=await fetch(u.toString(),{cache:'no-store',redirect:'follow'});
 const text=await r.text();let data;
 try{data=JSON.parse(text)}catch{
   // Gunakan proxy publik yang sudah menormalisasi redirect/HTML dari Apps Script.
   const proto=String(req.headers?.['x-forwarded-proto']||'https');
   const host=String(req.headers?.host||'nonton-gratisan.vercel.app').split(',')[0].trim();
   const fallback=new URL(proto+'://'+host+'/api/comments');
   Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=='')fallback.searchParams.set(k,String(v));});
   fallback.searchParams.set('_',Date.now());
   const fr=await fetch(fallback.toString(),{cache:'no-store'});
   const ft=await fr.text();
   try{data=JSON.parse(ft)}catch{throw new Error('Server komentar tidak mengembalikan JSON');}
 }
 if(!r.ok&&!data?.ok)throw new Error(data?.error||'Komentar gagal dimuat');
 if(data?.ok===false)throw new Error(data?.error||'Komentar gagal dimuat');
 return Array.isArray(data)?data:(Array.isArray(data.comments)?data.comments:(Array.isArray(data.items)?data.items:[]));
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  auth(req);
  const action=String(req.body?.action||'recent');
  if(action==='recent'){
   const limit=Math.min(Math.max(Number(req.body?.limit||30),1),100);
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'recent',limit},req)});
  }
  if(action==='list'){
   const mediaId=String(req.body?.mediaId||'').trim();
   if(!mediaId)throw Object.assign(new Error('Media ID wajib diisi'),{status:400});
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'list',mediaId},req)});
  }
  return res.status(400).json({error:'Action tidak dikenal'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}