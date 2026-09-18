const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'';

function auth(req){
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected) throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:500});
  if(req.headers['x-nova-key']!==expected) throw Object.assign(new Error('Admin key salah atau belum diisi'),{status:401});
}
function formBody(obj){return new URLSearchParams(Object.entries(obj).map(([k,v])=>[k,String(v??'')])).toString()}
async function callGet(params){
  if(!COMMENTS_API_URL) throw new Error('COMMENTS_APPS_SCRIPT_URL belum disetel di Vercel');
  const u=new URL(COMMENTS_API_URL);
  Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,String(v??'')));
  const r=await fetch(u,{redirect:'follow',cache:'no-store'}),j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false) throw new Error(j.error||'Comments API GET gagal');
  return j;
}
async function callPost(params){
  if(!COMMENTS_API_URL) throw new Error('COMMENTS_APPS_SCRIPT_URL belum disetel di Vercel');
  const r=await fetch(COMMENTS_API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:formBody(params)}),j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false) throw new Error(j.error||'Comments API POST gagal');
  return j;
}
module.exports=async function(req,res){
  try{
    auth(req);
    if(req.method==='GET'){
      const j=await callGet({action:'list',mediaId:req.query?.mediaId||''});
      return res.status(200).json(j);
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const action=String(req.body?.action||'').trim();
    if(!['reply','delete'].includes(action)) return res.status(400).json({error:'Action komentar tidak dikenal'});
    const j=await callPost({...req.body,action,admin:'NOVA Admin'});
    return res.status(200).json(j);
  }catch(e){return res.status(e.status||500).json({error:e.message||'Comments server error'})}
};
