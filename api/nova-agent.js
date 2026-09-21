const MODEL=process.env.OPENAI_MODEL||'gpt-5.4-mini';

let cachedAgentPromise=null;

async function getNovaAgent(){
  if(!cachedAgentPromise){
    cachedAgentPromise=(async()=>{
      const {Agent}=await import('@openai/agents');
      return new Agent({
        name:'NOVA Specialist',
        model:MODEL,
        instructions:[
          'Kamu adalah NOVA Specialist, agen AI yang hanya digunakan untuk tugas yang membutuhkan pemahaman bahasa, analisis, perbandingan, rekomendasi, atau percakapan natural.',
          'Jawab dalam Bahasa Indonesia.',
          'Gunakan nada hangat, tenang, dewasa, dan membantu. Jangan berlebihan dalam emoji dan jangan menggunakan rayuan romantis.',
          'Kamu hanya memiliki akses baca terhadap konteks data yang diberikan. Jangan mengarang data katalog atau TMDB.',
          'Jangan mengubah, menambah, menghapus, atau menulis Google Sheet, player, komentar, atau data pengguna.',
          'Bedakan sumber TMDB dan pustaka film. TMDB adalah discovery/metadata; pustaka adalah data katalog website.',
          'Jangan menyatakan sebuah judul bisa diputar hanya karena ada di TMDB.',
          'Bila konteks data tidak cukup, katakan apa yang belum tersedia daripada mengarang.',
          'Untuk pertanyaan sederhana yang sudah dijawab langsung oleh sumber data, cukup jawab berdasarkan konteks tanpa menambah klaim baru.'
        ].join('\\n\\n')
      });
    })();
  }
  return cachedAgentPromise;
}

export async function runNovaAgent({message,context=''}) {
  const agent=await getNovaAgent();
  const {run}=await import('@openai/agents');
  const input=context ? context+'\\n\\nPERTANYAAN PENGGUNA:\\n'+String(message||'') : String(message||'');
  const result=await run(agent,input,{maxTurns:4});
  const reply=typeof result.finalOutput==='string'?result.finalOutput.trim():'';
  if(!reply) throw new Error('NOVA Agent tidak mengembalikan jawaban teks');
  return {reply,lastAgent:result.lastAgent?.name||'NOVA Specialist'};
}
