const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function auth(req){
 const expected=process.env.NOVA_ADMIN_KEY;
 if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
 const supplied=req.headers['x-nova-key']||req.body?.adminKey||'';
 if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
async function listFromSheet(params={}){
 const buildUrl=(withAction=true)=>{
  const u=new URL(COMMENTS_API_URL);
  Object.entries(params).forEach(([k,v])=>{
    if(k==='action'&&!withAction)return;
    if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
  });
  if(withAction && !u.searchParams.has('action'))u.searchParams.set('action','recent');
  u.searchParams.set('_',Date.now());
  return u;
 };
 const request=async(withAction)=>{
  const u=buildUrl(withAction);
  const r=await fetch(u.toString(),{cache:'no-store',redirect:'follow'});
  const text=await r.text();let data;
  try{data=JSON.parse(text)}catch{throw new Error('Server komentar tidak mengembalikan JSON')}
  if(!r.ok||data?.ok===false)throw new Error(data?.error||'Komentar gagal dimuat');
  return Array.isArray(data)?data:(Array.isArray(data.comments)?data.comments:(Array.isArray(data.items)?data.items:[]));
 };
 try{return await request(true)}
 catch(e){
  if(/action tidak (dikenal|dikenali)|unknown action|invalid action/i.test(String(e?.message||''))) return await request(false);
  throw e;
 } 
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  auth(req);
  const action=String(req.body?.action||req.query?.action||'recent').trim().toLowerCase()||'recent';
  if(['recent','latest','all','comments','get_comments'].includes(action)){
   const limit=Math.min(Math.max(Number(req.body?.limit||30),1),100);
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'recent',limit})});
  }
  if(action==='list'){
   const mediaId=String(req.body?.mediaId||'').trim();
   if(!mediaId)throw Object.assign(new Error('Media ID wajib diisi'),{status:400});
   return res.status(200).json({ok:true,comments:await listFromSheet({action:'list',mediaId})});
  }
  return res.status(400).json({error:'Action komentar tidak dikenali: '+action});
 }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}