const COMMENTS_API_URL=process.env.COMMENTS_APPS_SCRIPT_URL||'https://script.google.com/macros/s/AKfycbwkSryiL98ofeLE13KhjqrzD8NtgxwVUEu6dvLiNAgO-i9O8bphnxy-bQ0yc6KXlyHV/exec';

function parseUpstream(text){
  const raw=String(text||'').trim();
  try{return JSON.parse(raw)}catch(_){}

  // Be tolerant of Apps Script responses that are wrapped as JSONP.
  const match=raw.match(/^[A-Za-z_$][0-9A-Za-z_$]*\(([^]*)\);?$/);
  if(match){
    try{return JSON.parse(match[1])}catch(_){}
  }

  return null;
}

async function forward(url, options={}){
  const r=await fetch(url,{...options,redirect:'follow',cache:'no-store'});
  const text=await r.text();
  const data=parseUpstream(text);

  if(!data){
    console.warn('Comments upstream bukan JSON:', text.slice(0,300));
    return {ok:false,upstreamError:true,error:'Respons Google Apps Script tidak valid',comments:[]};
  }

  if(!r.ok||data?.ok===false){
    const err=data?.error||`Google Sheets komentar gagal (HTTP ${r.status})`;
    console.warn('Comments upstream gagal:',err);
    return {ok:false,upstreamError:true,error:err,comments:[]};
  }

  return data;
}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const u=new URL(COMMENTS_API_URL);
      for(const [k,v] of Object.entries(req.query||{})){
        if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
      }

      // Minta JSONP secara eksplisit agar Apps Script lama tetap kompatibel.
      if(!u.searchParams.has('callback'))u.searchParams.set('callback','nontonGratisanComments');

      const data=await forward(u.toString());
      res.setHeader('cache-control','no-store');
      return res.status(200).json(
        data?.upstreamError
          ? {ok:true,comments:[],degraded:true,error:data.error||'Komentar online sementara tidak tersedia'}
          : data
      );
    }

    if(req.method==='POST'){
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const params=new URLSearchParams();
      for(const [k,v] of Object.entries(body)){
        if(v!==undefined&&v!==null)params.set(k,String(v));
      }

      const data=await forward(COMMENTS_API_URL,{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:params.toString()
      });

      if(data?.upstreamError){
        return res.status(200).json({ok:false,queued:true,degraded:true,error:data.error||'Komentar akan dicoba lagi.'});
      }

      // Balas otomatis setelah komentar publik benar-benar diterima.
      // Jika AI gagal, komentar tetap sukses.
      if(String(body.action||'')==='add'){
        try{
          const {generateReply,replyToSheet}=await import('./nova-comment-bot.js');
          const commentId=String(
            data?.commentId||data?.id||data?.comment?.commentId||data?.comment?.id||body.commentId||body.clientId||''
          ).trim();
          if(!commentId)throw new Error('Comment ID tidak tersedia dari server komentar');
          const comment={...body,commentId};
          const reply=await generateReply(comment);
          await replyToSheet(comment,reply);
          return res.status(200).json({...data,novaReply:{ok:true,reply}});
        }catch(e){
          console.warn('NOVA auto-reply gagal:',e?.message||e);
          return res.status(200).json({...data,novaReply:{ok:false,error:e?.message||'NOVA gagal membalas'}});
        }
      }

      return res.status(200).json(data);
    }

    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){
    return res.status(e.status||500).json({ok:false,error:e.message||'Comments proxy error'});
  }
}
