const SHEET_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';

function parseCSV(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(quoted){ if(ch==='"'&&next==='"'){cell+='"';i++;} else if(ch==='"') quoted=false; else cell+=ch; }
    else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r') cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
function read(text){
  const rows=parseCSV(text); if(!rows.length)return {columns:[],objects:[]};
  const columns=rows[0].map(x=>String(x||'').trim());
  const objects=rows.slice(1).filter(r=>r.some(v=>String(v||'').trim())).map((r,i)=>({rowNumber:i+2,data:Object.fromEntries(columns.map((c,j)=>[c,String(r[j]??'').trim()]))}));
  return {columns,objects};
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected)return res.status(503).json({error:'NOVA_ADMIN_KEY belum disetel di Vercel'});
  if(req.headers['x-nova-key']!==expected)return res.status(401).json({error:'Admin key salah'});
  try{
    const r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'}});
    if(!r.ok)throw new Error('Google Sheet HTTP '+r.status);
    const {columns,objects}=read(await r.text());
    const find=(...names)=>{const wanted=names.map(norm);return columns.find(c=>wanted.includes(norm(c)))};
    const titleKey=find('title','judul','name')||columns[0];
    const linkKey=find('link','url','video','embed','source');
    const genreKey=find('genre');
    const yearKey=find('year','tahun');
    const ratingKey=find('rating');
    const actorKey=find('actor','actors','aktor');
    const descKey=find('description','deskripsi','sinopsis');
    const issues=[];
    const add=(type,row,message)=>issues.push({type,row,message});
    const seenLinks=new Map();
    const titleYears=[];
    objects.forEach(o=>{
      const d=o.data, title=d[titleKey]||'', link=norm(d[linkKey]), year=norm(d[yearKey]);
      if(!title)add('missing-title',o.rowNumber,'Judul kosong');
      if(link) { if(seenLinks.has(link)) add('duplicate-link',o.rowNumber,'Link sama dengan baris '+seenLinks.get(link)); else seenLinks.set(link,o.rowNumber); }
      else add('missing-link',o.rowNumber,'Link kosong');
      if(year && /\b(19|20)\d{2}\b/.test(title) && !title.includes(year)) add('year-conflict',o.rowNumber,'Tahun pada judul berbeda dengan kolom Tahun');
      if(ratingKey && /^(?:[1-9]|10)$/.test(d[ratingKey]||'') && /episode|season/i.test(title)) add('rating-check',o.rowNumber,'Rating berupa angka bulat yang perlu diverifikasi sebagai rating atau nomor episode');
      if(actorKey && !d[actorKey]) add('missing-actor',o.rowNumber,'Aktor kosong');
      if(descKey && !d[descKey]) add('missing-description',o.rowNumber,'Deskripsi kosong');
      if(genreKey && !d[genreKey]) add('missing-genre',o.rowNumber,'Genre kosong');
      if(yearKey && !d[yearKey]) add('missing-year',o.rowNumber,'Tahun kosong');
    });
    const unnamed=columns.filter(c=>!c);
    if(unnamed.length)add('empty-column',1,'Ada '+unnamed.length+' kolom tanpa nama');
    const counts={};
    issues.forEach(x=>counts[x.type]=(counts[x.type]||0)+1);
    const lines=[
      'PREVIEW PERBAIKAN — READ-ONLY',
      '',
      'Total baris: '+objects.length,
      'Tidak ada perubahan yang dilakukan.',
      '',
      'Kategori temuan:',
      ...Object.entries(counts).map(([k,v])=>'- '+k+': '+v),
      '',
      'Contoh tindakan yang nanti bisa disiapkan (belum dijalankan):',
      '- tandai baris Link kosong untuk dilengkapi',
      '- tandai Link yang sama antarbaris untuk verifikasi episode',
      '- tandai konflik Tahun untuk verifikasi',
      '- tandai rating episode yang perlu dicek',
      '- tandai field kosong untuk dilengkapi tanpa menghapus baris',
      '',
      'Temuan detail (maks. 40):',
      ...(issues.slice(0,40).map(x=>'- Baris '+x.row+' ['+x.type+']: '+x.message))
    ];
    return res.status(200).json({ok:true,preview:lines.join('\n'),issues:issues.slice(0,200),counts});
  }catch(e){return res.status(502).json({error:'Preview perbaikan gagal: '+(e.message||'unknown error')});}
}