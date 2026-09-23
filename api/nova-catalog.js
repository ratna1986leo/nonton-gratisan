const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';

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

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const response=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'}});
    if(!response.ok) throw new Error('Google Sheet HTTP '+response.status);
    const text=await response.text();
    const rows=parseCSV(text);
    if(!rows.length) return res.status(200).json({ok:true,count:0,columns:[],rows:[],stats:{}});
    const columns=rows[0].map(x=>String(x||'').trim());
    const data=rows.slice(1).filter(r=>r.some(v=>String(v||'').trim()));
    const objects=data.map(r=>Object.fromEntries(columns.map((c,i)=>[c,String(r[i]??'').trim()])));
    const find=(...names)=>{const n=names.map(x=>x.toLowerCase()); return columns.find(c=>n.includes(c.toLowerCase()))};
    const titleKey=find('title','judul','name')||columns[0];
    const typeKey=find('type','tipe','kategori');
    const genreKey=find('genre');
    const inferType=(o)=>{
      const title=String(o[titleKey]||'').toLowerCase();
      const genre=String(genreKey?o[genreKey]||'':'').toLowerCase();
      const s=title+' '+genre;
      if(/\bbioskop\b/.test(s)) return 'Bioskop';
      if(/\bseries\b|\bserial\b|\bseason\b|\bepisode\b/.test(s)) return 'Series';
      if(/\bfilm\b|\bmovie\b/.test(s)) return 'Film';
      return 'Lainnya';
    };
    const yearKey=find('year','tahun');
    const linkKey=find('link','url','video','embed','source');
    const descKey=find('description','deskripsi','sinopsis','overview');
    const actorKey=find('actor','actors','aktor');
    const titledYears=objects.map(x=>String(x[titleKey]||'').trim().toLowerCase()+'|'+String(yearKey?x[yearKey]||'':'').trim()).filter(Boolean);
    const stats={
      total:objects.length,
      withTitle:objects.filter(x=>x[titleKey]).length,
      playable:linkKey?objects.filter(x=>String(x[linkKey]||'').trim()).length:null,
      unplayable:linkKey?objects.filter(x=>!String(x[linkKey]||'').trim()).length:null,
      missingDescription:descKey?objects.filter(x=>!String(x[descKey]||'').trim()).length:null,
      missingGenre:genreKey?objects.filter(x=>!String(x[genreKey]||'').trim()).length:null,
      missingActor:actorKey?objects.filter(x=>!String(x[actorKey]||'').trim()).length:null,
      missingYear:yearKey?objects.filter(x=>!String(x[yearKey]||'').trim()).length:null,
      duplicates:objects.length-new Set(titledYears).size,
      movies:objects.filter(x=>inferType(x)==='Film').length,
      series:objects.filter(x=>inferType(x)==='Series').length,
      bioskop:objects.filter(x=>inferType(x)==='Bioskop').length,
      otherTypes:objects.filter(x=>inferType(x)==='Lainnya').length,
      years:yearKey?[...new Set(objects.map(x=>x[yearKey]).filter(Boolean))].sort().reverse().slice(0,10):[]
    };
    return res.status(200).json({ok:true,count:objects.length,columns,rows:objects.slice(0,500),stats});
  }catch(e){ return res.status(502).json({error:'Katalog read-only gagal: '+(e.message||'unknown error')}); }
}