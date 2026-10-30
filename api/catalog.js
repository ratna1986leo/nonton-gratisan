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
        event_type:['page_view','heartbeat','player_loaded','player_interaction'].includes(String(body.event_type||'')) ? String(body.event_type) : 'page_view',
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
  const requestedFormat=String(req.query?.format||'').toLowerCase();
  if(requestedFormat==='seo-page'){
    const type=String(req.query?.type||'').toLowerCase();
    const id=String(req.query?.id||'').trim();
    const slug=String(req.query?.slug||'').trim();
    if(!['movie','tv'].includes(type)||!/^\d+$/.test(id)||!slug||slug.includes('/')||slug.includes('\\')){
      return res.status(400).send('Invalid media route');
    }
    const humanTitle=slug.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g,ch=>ch.toUpperCase());
    const mediaLabel=type==='tv'?'Series':'Film';
    const canonical=BASE_URL+'/'+type+'/'+id+'/'+encodeURIComponent(slug);
    const pageTitle=('Nonton '+humanTitle+' Sub Indo | NontonGratisan').slice(0,60);
    const description=(humanTitle+' — informasi '+mediaLabel.toLowerCase()+' subtitle Indonesia di NontonGratisan.').slice(0,155);
    const escapeHtml=value=>String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
    const host=String(req.headers['x-forwarded-host']||req.headers.host||'nonton-gratisan.vercel.app').split(',')[0].trim();
    try{
      const shell=await fetch('https://'+host+'/index.html',{headers:{Accept:'text/html'},redirect:'manual'});
      if(!shell.ok)return res.status(502).send('Unable to load application shell');
      let html=await shell.text();
      const safeTitle=escapeHtml(pageTitle),safeDescription=escapeHtml(description),safeCanonical=escapeHtml(canonical);
      const replacements=[
        [/<title>[^<]*<\/title>/i,'<title>'+safeTitle+'</title>'],
        [/<meta\s+name="description"[^>]*>/i,'<meta name="description" content="'+safeDescription+'">'],
        [/<link\s+rel="canonical"[^>]*>/i,'<link rel="canonical" href="'+safeCanonical+'">'],
        [/<link\s+rel="alternate"\s+hreflang="id-ID"[^>]*>/i,'<link rel="alternate" hreflang="id-ID" href="'+safeCanonical+'">'],
        [/<meta\s+property="og:title"[^>]*>/i,'<meta property="og:title" content="'+safeTitle+'">'],
        [/<meta\s+property="og:description"[^>]*>/i,'<meta property="og:description" content="'+safeDescription+'">'],
        [/<meta\s+property="og:url"[^>]*>/i,'<meta property="og:url" content="'+safeCanonical+'">'],
        [/<meta\s+property="og:type"[^>]*>/i,'<meta property="og:type" content="'+(type==='tv'?'video.tv_show':'video.movie')+'">'],
        [/<meta\s+name="twitter:title"[^>]*>/i,'<meta name="twitter:title" content="'+safeTitle+'">'],
        [/<meta\s+name="twitter:description"[^>]*>/i,'<meta name="twitter:description" content="'+safeDescription+'">']
      ];
      for(const [pattern,replacement] of replacements)html=html.replace(pattern,replacement);
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=900');
      res.setHeader('X-Robots-Tag','index, follow');
      return res.status(200).send(html);
    }catch(error){
      console.error('SEO shell rendering failed:',error);
      return res.status(502).send('SEO page temporarily unavailable');
    }
  }
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||'').trim();
    if(!source) return res.status(500).json({error:'GOOGLE_SHEETS_CSV_URL belum disetel di Vercel'});
    const sourceUrl=new URL(source);
    if(sourceUrl.protocol!=='https:' || sourceUrl.hostname!=='docs.google.com' || !/^\/spreadsheets\/d\/e\//.test(sourceUrl.pathname)) {
      return res.status(500).json({error:'Sumber katalog Google Sheets tidak valid'});
    }
    sourceUrl.searchParams.set('_ts', String(Date.now()));
    const r=await fetch(sourceUrl.toString(),{cache:'no-store'});
    const body=await r.text();

    const sitemapFormat=String(req.query?.format||'').toLowerCase();
    if(sitemapFormat==='sitemap-index'){
      const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
        '  <sitemap><loc>'+BASE_URL+'/api/sitemap-pustaka</loc></sitemap>\n'+
        '</sitemapindex>';
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.setHeader('Content-Type','application/xml; charset=utf-8');
      return res.status(200).send(xml);
    }
    if(['sitemap','sitemap-pustaka','sitemap-all'].includes(sitemapFormat)){
      const rows=parseCSV(body);
      const objects=rows.length?rows.slice(1).filter(row=>row.some(v=>String(v||'').trim()!=='')).map(row=>{
        const headers=rows[0].map(x=>String(x||'').trim());
        return Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]));
      }):[];
      const urls=[];
      const seen=new Set(urls.map(x=>x.loc));
      for(const row of objects){
        const title=row.Judul||row.judul||row.Title||row.title||'';
        const link=row.Link||row.link||'';
        if(!title || !String(link).trim()) continue;
        const series=isSeries(row);
        if(sitemapFormat!=='sitemap-all' && series) continue;
        const type=series?'tv':'movie';
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
      if(sitemapFormat==='sitemap-text'){
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
