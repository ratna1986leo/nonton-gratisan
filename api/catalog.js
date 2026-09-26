const DEFAULT_CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const BASE_URL='https://nonton-gratisan.vercel.app';

function parseCSV(text){
  const rows=[];let row=[],v='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){
      if(q&&next==='"'){v+='"';i++}else q=!q;
    }else if(ch===','&&!q){row.push(v);v=''}
    else if((ch==='\n'||ch==='\r')&&!q){
      if(ch==='\r'&&next==='\n')i++;
      row.push(v);v='';
      if(row.some(x=>String(x||'').trim()!==''))rows.push(row);
      row=[];
    }else v+=ch;
  }
  row.push(v);if(row.some(x=>String(x||'').trim()!==''))rows.push(row);
  return rows;
}
function hashStable(title,type,link){
  const source=`${type||'movie'}|${String(title||'').trim().toLowerCase()}|${String(link||'').trim()}`;
  let hash=2166136261;
  for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return Math.abs(hash>>>0)||1;
}
function slugify(s){
  return String(s||'').toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi,'-')
    .replace(/^-+|-+$/g,'')||'film';
}
function isSeries(row){
  const title=String(row.Judul||row.judul||'').toLowerCase();
  const genre=String(row.Genre||row.genre||'').toLowerCase();
  const type=String(row.Tipe||row.Type||row.Jenis||'').toLowerCase();
  return /series|tv|serial|drakor/.test(type) ||
    /series|tv series|tv-series|drakor|k-drama|k drama|drama korea|series korea|series asia|series indonesia|series barat|series india|tv korea|tv asia|tv indonesia|tv barat|tv india/.test(genre) ||
    /\b(?:season|series|episode|ep)\s*\d*\b/i.test(title) ||
    /\bbag(?:ian)?\s*\d+\b/i.test(title) ||
    /\[\s*\d{1,3}\s*\]/.test(title);
}
function episodeNumber(title){
  const m=String(title||'').match(/\[\s*(\d{1,3})\s*\]/) ||
    String(title||'').match(/Ep(?:isode)?\s*(\d+)/i) ||
    String(title||'').match(/\bBag(?:ian)?\s*(\d+)\b/i);
  return m?Number(m[1]):1;
}
function cleanTitle(title){
  return String(title||'')
    .replace(/^Nonton\s*/i,'')
    .replace(/[\(\[]\s*\d{4}\s*[\)\]]/g,'')
    .replace(/Series\s*Sub\s*Indo/gi,'')
    .replace(/Sub\s*Indo(?:nesia)?/gi,'')
    .replace(/\[\s*\d+\s*\]/g,'')
    .replace(/Ep(?:isode)?\s*\d+/gi,'')
    .replace(/\bBag(?:ian)?\s*\d+\b/gi,'')
    .trim() || String(title||'Tanpa Judul');
}
function xmlEscape(v){
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

export default async function handler(req,res){
  if(req.method==='POST'){
    try{
      const body=req.body||{};
      const clean=(value,max)=>String(value??'').trim().slice(0,max);
      const sessionId=clean(body.session_id,80);
      const path=clean(body.path||'/',500);
      if(sessionId.length<16||!path) return res.status(400).json({error:'Invalid analytics payload'});
      const payload={
        event_type:['page_view','heartbeat'].includes(String(body.event_type||'')) ? String(body.event_type) : 'page_view',
        session_id:sessionId,
        path,
        page_title:clean(body.page_title,300),
        media_type:clean(body.media_type,20),
        media_id:clean(body.media_id,80),
        referrer:clean(body.referrer,500),
        device_type:clean(body.device_type,30),
        browser:clean(body.browser,80),
        country:clean(req.headers['x-vercel-ip-country']||'',80),
        city:clean(req.headers['x-vercel-ip-city']||'',120),
        user_agent:clean(req.headers['user-agent']||'',500)
      };
      const supabaseUrl='https://pxybcjmrkenkzmaavuxm.supabase.co';
      const supabaseKey='sb_publishable_P4xAbhb76YJcuhSMrUSXkg_IZYNFWdW';
      const r=await fetch(supabaseUrl+'/rest/v1/visitor_events',{
        method:'POST',
        headers:{apikey:supabaseKey,Authorization:'Bearer '+supabaseKey,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(payload)
      });
      if(!r.ok){console.error('analytics insert failed',r.status,await r.text());return res.status(502).json({error:'Analytics storage unavailable'});}
      return res.status(204).end();
    }catch(e){
      console.error('analytics collector error',e);
      return res.status(500).json({error:'Analytics collector failed'});
    }
  }
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim();
    const sourceUrl=new URL(source);
    sourceUrl.searchParams.set('_ts', String(Date.now()));
    const r=await fetch(sourceUrl.toString(),{cache:'no-store'});
    const body=await r.text();

    if(String(req.query?.format||'').toLowerCase()==='sitemap'){
      const rows=parseCSV(body);
      const objects=rows.length?rows.slice(1).filter(row=>row.some(v=>String(v||'').trim()!=='')).map(row=>{
        const headers=rows[0].map(x=>String(x||'').trim());
        return Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]));
      }):[];
      const urls=[
        {loc:BASE_URL+'/',changefreq:'daily',priority:'1.0'},
        {loc:BASE_URL+'/movies',changefreq:'daily',priority:'0.9'},
        {loc:BASE_URL+'/tv',changefreq:'daily',priority:'0.9'},
        {loc:BASE_URL+'/search',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=action',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=horror',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=comedy',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=thriller',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=drama',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=romance',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=sci-fi',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=animation',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=series-korea',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=series-barat',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/kategori.php?slug=series-indonesia',changefreq:'weekly',priority:'0.6'},
        {loc:BASE_URL+'/dukung.html',changefreq:'monthly',priority:'0.3'},
        {loc:BASE_URL+'/contact.html',changefreq:'monthly',priority:'0.3'},
        {loc:BASE_URL+'/privacy-policy.html',changefreq:'monthly',priority:'0.2'},
        {loc:BASE_URL+'/terms.html',changefreq:'monthly',priority:'0.2'},
        {loc:BASE_URL+'/copyright.html',changefreq:'monthly',priority:'0.2'}
      ];
      const seen=new Set(urls.map(x=>x.loc));
      for(const row of objects){
        const title=row.Judul||row.judul||row.Title||row.title||'';
        const link=row.Link||row.link||'';
        if(!title || (isSeries(row)&&episodeNumber(title)>1)) continue;
        const type=isSeries(row)?'tv':'movie';
        // Samakan slug sitemap dengan URL canonical yang dibuat index.html:
        // buang prefix "Nonton" dan label "Sub Indo", tetapi pertahankan tahun
        // agar tidak terjadi sitemap -> canonical mismatch (contoh: colony-2026).
        const clean=String(title)
          .replace(/^Nonton\s*/i,'')
          .replace(/Sub\s*Indo(?:nesia)?/i,'')
          .trim() || title;
        const loc=BASE_URL+'/'+type+'/'+hashStable(title,type,link)+'/'+slugify(clean);
        if(!seen.has(loc)){seen.add(loc);urls.push({loc,changefreq:'weekly',priority:'0.8'})}
      }
      const sitemapText=urls.map(u=>u.loc).join('\n')+'\n';
      if(String(req.query?.format||'').toLowerCase()==='sitemap-text'){
        res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('Content-Type','text/plain; charset=utf-8');
        return res.status(200).send(sitemapText);
      }
      const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
        urls.map(u=>'  <url><loc>'+xmlEscape(u.loc)+'</loc><changefreq>'+u.changefreq+'</changefreq><priority>'+u.priority+'</priority></url>').join('\n')+
        '\n</urlset>';
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.setHeader('Content-Type','application/xml; charset=utf-8');
      return res.status(200).send(xml);
    }

    res.setHeader('Cache-Control','public, max-age=60, s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    return res.status(r.status).send(body);
  }catch(e){
    return res.status(502).json({error:e.message||'Catalog proxy gagal'});
  }
}
