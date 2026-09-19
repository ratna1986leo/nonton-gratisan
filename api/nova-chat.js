const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected) return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY belum disetel di Vercel'});
  const message=typeof req.body?.message==='string'?req.body.message.trim():'';
  if(!message) return res.status(400).json({error:'Pesan kosong'});
  if(message.length>4000) return res.status(400).json({error:'Pesan terlalu panjang'});
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:MODEL,
        store:false,
        instructions:'Kamu adalah NOVA, asisten admin NontonGratisan. Pada versi ini kamu hanya boleh menjawab percakapan dan membantu analisis. Jangan mengubah, menghapus, atau menulis katalog, Google Sheet, TMDB, player, atau data pengguna.',
        input:message
      })
    });
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'OpenAI request gagal'});
    const reply = typeof data.output_text==='string' && data.output_text.trim() ? data.output_text.trim() : (Array.isArray(data.output) ? data.output.flatMap(item=>Array.isArray(item?.content)?item.content.map(part=>typeof part?.text==='string'?part.text:(typeof part?.value==='string'?part.value:'')):[]).filter(Boolean).join('\n').trim() : '');\n    if(!reply) return res.status(502).json({error:'OpenAI berhasil merespons, tetapi teks jawaban NOVA tidak ditemukan.'});\n    return res.status(200).json({ok:true,reply});
  }catch(e){
    return res.status(500).json({error:'NOVA error: '+(e.message||'unknown error')});
  }
}