const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function parseCSV(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(quoted){
      if(ch==='"' && next==='"'){cell+='"'; i++;}
      else if(ch==='"') quoted=false;
      else cell+=ch;
    }else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r') cell+=ch;
  }
  if(cell!=='' || row.length){row.push(cell);rows.push(row);}
  return rows;
}

function readCatalog(text){
  const rows=parseCSV(text);
  if(!rows.length) return {columns:[],rows:[],stats:{total:0}};
  const columns=rows[0].map(x=>String(x||'').trim());
  const data=rows.slice(1).filter(r=>r.some(v=>String(v||'').trim()));
  const objects=data.map(r=>Object.fromEntries(columns.map((c,i)=>[c,String(r[i]??'').trim()])));
  const find=(...names)=>{const n=names.map(x=>x.toLowerCase());return columns.find(c=>n.includes(c.toLowerCase()))};
  const titleKey=find('title','judul','name')||columns[0];
  const typeKey=find('type','tipe','kategori');
  const yearKey=find('year','tahun');
  const linkKey=find('link','url','video','embed','source');
  const stats={
    total:objects.length,
    withTitle:objects.filter(x=>x[titleKey]).length,
    duplicates:objects.length-new Set(objects.map(x=>x[titleKey].toLowerCase()).filter(Boolean)).size,
    movies:typeKey?objects.filter(x=>/movie|film/i.test(x[typeKey])).length:null,
    series:typeKey?objects.filter(x=>/tv|series/i.test(x[typeKey])).length:null
  };
  return {columns,rows:objects.slice(0,500),stats,titleKey,typeKey,yearKey,linkKey};
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected) return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY belum disetel di Vercel'});
  try{
    const response=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'}});
    if(!response.ok) throw new Error('Google Sheet HTTP '+response.status);
    const catalog=readCatalog(await response.text());
    const compact=JSON.stringify({columns:catalog.columns,stats:catalog.stats,rows:catalog.rows});
    const prompt=[
      'Analisis katalog NontonGratisan secara READ-ONLY.',
      'Jangan mengubah, menghapus, menulis, atau menyarankan eksekusi otomatis terhadap data.',
      'Berikan laporan singkat dalam bahasa Indonesia dengan bagian:',
      '1. Ringkasan katalog',
      '2. Masalah data yang terlihat',
      '3. Judul/baris yang perlu dicek jika memang ada bukti dari data',
      '4. Rekomendasi perbaikan yang aman.',
      'Jangan mengarang kolom, judul, atau masalah. Jika tipe film/series tidak tersedia, katakan tidak terdeteksi.',
      'Data katalog:',
      compact
    ].join('\n\n');
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:MODEL,store:false,instructions:'Kamu adalah auditor data untuk admin NontonGratisan. Tugasmu hanya menganalisis data yang diberikan. Semua output adalah PREVIEW/READ-ONLY. Jangan mengklaim telah melakukan perubahan.',input:prompt})
    });
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'OpenAI request gagal'});
    const analysis=typeof data.output_text==='string'&&data.output_text.trim()?data.output_text.trim():(Array.isArray(data.output)?data.output.flatMap(item=>Array.isArray(item?.content)?item.content.map(part=>typeof part?.text==='string'?part.text:(typeof part?.value==='string'?part.value:'')):[]).filter(Boolean).join('\n').trim():'');
    if(!analysis) return res.status(502).json({error:'OpenAI merespons tetapi teks analisis tidak ditemukan.'});
    return res.status(200).json({ok:true,analysis,stats:catalog.stats});
  }catch(e){return res.status(502).json({error:'Analisis katalog gagal: '+(e.message||'unknown error')});}
}