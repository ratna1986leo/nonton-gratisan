const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

async function forward(url, options={}){
  const r=await fetch(url,{...options,redirect:'follow',cache:'no-store'});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{throw Object.assign(new Error('Google Apps Script tidak mengembalikan JSON'),{status:502,raw:text.slice(0,500)})}
  if(!r.ok||data?.ok===false) {
    const err = data?.error || `Google Sheets komentar gagal (HTTP ${r.status})`;
    console.warn('Comments upstream gagal:', err);
    return { ok:false, upstreamError:true, error:err, comments:[] };
  }
  return data;
}
async function forwardRecent(){
  const base=new URL(COMMENTS_API_URL);
  base.searchParams.set('action','recent');
  base.searchParams.set('limit','60');
  base.searchParams.set('_',Date.now());
  const first=await forward(base.toString());
  if(!first?.upstreamError || !/action tidak (dikenal|dikenali)|unknown action|invalid action/i.test(String(first.error||''))) return first;
  const fallback=new URL(COMMENTS_API_URL);
  fallback.searchParams.set('limit','60');
  fallback.searchParams.set('_',Date.now());
  return forward(fallback.toString());
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const u=new URL(COMMENTS_API_URL);
      for(const [k,v] of Object.entries(req.query||{})){
        if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
      }
      const data = (String(u.searchParams.get('action')||'').toLowerCase()==='recent') ? await forwardRecent() : await forward(u.toString());
      const callback = String(u.searchParams.get('callback') || '');
      if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
        res.setHeader('content-type','application/javascript; charset=utf-8');
        res.setHeader('cache-control','no-store');
        return res.status(200).send(callback + '(' + JSON.stringify(data).replace(/</g,'\\u003c') + ');');
      }
      // Komentar adalah fitur pelengkap: jangan biarkan kegagalan Google Apps Script
      // membuat endpoint publik terus-menerus mengembalikan 4xx dan mengganggu halaman.
      return res.status(200).json(data?.ok === false ? {ok:false, comments:[], degraded:true, error:data.error||'Sumber komentar sedang tidak tersedia'} : data);
    }
    if(req.method==='POST'){
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const params=new URLSearchParams();
      for(const [k,v] of Object.entries(body))if(v!==undefined&&v!==null)params.set(k,String(v));
      const data = await forward(COMMENTS_API_URL,{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:params.toString()
      });
      return res.status(200).json(data?.ok === false ? {ok:false, queued:true, degraded:true} : data);
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Comments proxy error'});
  }
}