const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

async function forward(url, options={}){
  const r=await fetch(url,{...options,redirect:'follow',cache:'no-store'});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{throw Object.assign(new Error('Google Apps Script tidak mengembalikan JSON'),{status:502,raw:text.slice(0,500)})}
  if(!r.ok||data?.ok===false)throw Object.assign(new Error(data?.error||'Google Sheets komentar gagal'),{status:r.ok?400:r.status});
  return data;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const u=new URL(COMMENTS_API_URL);
      for(const [k,v] of Object.entries(req.query||{})){
        if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
      }
      const data = await forward(u.toString());
      const callback = String(u.searchParams.get('callback') || '');
      if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
        res.setHeader('content-type','application/javascript; charset=utf-8');
        res.setHeader('cache-control','no-store');
        return res.status(200).send(callback + '(' + JSON.stringify(data).replace(/</g,'\\u003c') + ');');
      }
      return res.status(200).json(data);
    }
    if(req.method==='POST'){
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const params=new URLSearchParams();
      for(const [k,v] of Object.entries(body))if(v!==undefined&&v!==null)params.set(k,String(v));
      return res.status(200).json(await forward(COMMENTS_API_URL,{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:params.toString()
      }));
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Comments proxy error'});
  }
}