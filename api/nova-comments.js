const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
 const expected=process.env.NOVA_ADMIN_KEY;
 if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
 const supplied=req.headers['x-nova-key']||req.body?.adminKey||'';
 if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
async function fetchSheet(params={}){
 const u=new URL(COMMENTS_API_URL);
 Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));});
 u.searchParams.set('_',Date.now());
 const r=await fetch(u.toString(),{cache:'no-store'});
 const text=await r.text();let data;
 try{data=JSON.parse(text)}catch{throw new Error('Server komentar tidak mengembalikan JSON')}
 return {r,data};
}
function extractComments(data){
 return Array.isArray(data)?data:(Array.isArray(data?.comments)?data.comments:(Array.isArray(data?.items)?data.items:[]));
}
async function listFromSheet(params={},fallbackParams=null){
 const first=await fetchSheet(params);
 if(first.r.ok&&first.data?.ok!==false)return extractComments(first.data);
 const err=String(first.data?.error||'');
 if(fallbackParams && /action tidak dikenali|unknown action|unsupported action/i.test(err)){
  const fallback=await fetchSheet(fallbackParams);
  if(!fallback.r.ok||fallback.data?.ok===false)throw new Error(fallback.data?.error||'Komentar gagal dimuat');
  return extractComments(fallback.data);
 }
 throw new Error(err||'Komentar gagal dimuat');
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  auth(req);
  const action=String(req.body?.action||'recent');
  if(action==='recent'){
   const limit=Math.min(Math.max(Number(req.body?.limit||30),1),100);
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'recent',limit},{limit})});
  }
  if(action==='list'){
   const mediaId=String(req.body?.mediaId||'').trim();
   if(!mediaId)throw Object.assign(new Error('Media ID wajib diisi'),{status:400});
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'list',mediaId},{mediaId})});
  }
  return res.status(400).json({error:'Action tidak dikenal'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}