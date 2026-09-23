const SHEET_CSV_URL=process.env.GOOGLE_SHEETS_CSV_URL||'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';

function auth(req){
  const expected=process.env.NOVA_ADMIN_KEY;
  const supplied=req.headers['x-nova-key']||'';
  if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
  if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function norm(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function getUrlCandidates(raw){
  const text=String(raw||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'");
  const out=[];const add=u=>{
    let x=String(u||'').trim().replace(/^['"]|['"]$/g,'');
    if(x.startsWith('//'))x='https:'+x;
    if(/^https?:\/\//i.test(x)&&!out.includes(x))out.push(x);
  };
  let m;const attr=/(?:src|href|data-src|data-url|content)=\s*["']([^"']+)["']/gi;
  while((m=attr.exec(text)))add(m[1]);
  const plain=/(https?:\/\/[^\s"'<>]+)/gi;
  while((m=plain.exec(text)))add(m[1].replace(/[),;]+$/,''));
  return out.slice(0,8);
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    auth(req);
    const q=String(req.query?.q||'').trim();
    const year=String(req.query?.year||'').trim();
    if(q.length<2)return res.status(400).json({error:'Query judul minimal 2 karakter'});
    const r=await fetch(SHEET_CSV_URL,{headers:{accept:'text/csv'},cache:'no-store'});
    if(!r.ok)throw new Error('Google Sheet HTTP '+r.status);
    const rows=parseCSV(await r.text());if(!rows.length)return res.status(200).json({ok:true,results:[]});
    const cols=rows[0].map(x=>String(x||'').trim());
    const find=(...names)=>cols.find(c=>names.includes(c.toLowerCase().trim()));
    const titleKey=find('title','judul','name')||cols[0];
    const yearKey=find('year','tahun');
    const typeKey=find('type','tipe','jenis','kategori');
    const linkKey=find('link','url','video','embed','source','player','embedurl');
    if(!linkKey)return res.status(200).json({ok:true,results:[]});
    const nq=norm(q);
    const data=rows.slice(1).map((r,i)=>Object.fromEntries(cols.map((c,j)=>[c,String(r[j]??'').trim()]))).filter(o=>o[titleKey]);
    const scored=data.map((o,i)=>{
      const title=norm(o[titleKey]);let score=0;
      if(title===nq)score+=1000;
      if(title.includes(nq))score+=500;
      if(nq.includes(title)&&title.length>=3)score+=250;
      const y=yearKey?String(o[yearKey]||'').slice(0,4):'';
      if(year&&y===year)score+=200;
      const urls=getUrlCandidates(o[linkKey]);if(urls.length)score+=100;
      return {o,score,urls,rowNumber:i+2};
    }).filter(x=>x.score>0&&x.urls.length).sort((a,b)=>b.score-a.score).slice(0,15);
    return res.status(200).json({ok:true,results:scored.map(x=>({rowNumber:x.rowNumber,title:x.o[titleKey]||'',year:yearKey?x.o[yearKey]||'':'',type:typeKey?x.o[typeKey]||'':'',urls:x.urls}))});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Pencarian player gagal'});}
}
