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
  const title=String(row.Judul||row.judul||'').trim();
  const genre=String(row.Genre||row.genre||'').trim();
  const type=String(row.Tipe||row.Type||row.Jenis||'').trim();
  const explicitType=/^(series|tv|serial|drakor)$/i.test(type);
  const seriesGenre=/\b(?:series|tv series|tv-series|drakor|k-drama|k drama|drama korea|series korea|series asia|series indonesia|series barat|series india|tv korea|tv asia|tv indonesia|tv barat|tv india)\b/i.test(genre);
  const seriesMarker=/\b(?:season|series|episode|ep)\s*\d*\b/i.test(title);
  const episodeMarker=/\b(?:episode|ep)\s*\d+\b|\bbag(?:ian)?\s*\d+\b|\[\s*\d{1,3}\s*\]/i.test(title);
  return explicitType || seriesGenre || seriesMarker || episodeMarker;
}
function episodeNumber(title){
  const text=String(title||'');
  const bracket=text.match(/\[\s*(\d{1,3})\s*\]/);
  const episode=text.match(/\b(?:Ep|Episode)\s*(\d+)\b/i);
  const part=text.match(/\bBag(?:ian)?\s*(\d+)\b/i);
  const number=bracket?.[1] || episode?.[1] || part?.[1];
  return number ? Number(number) : 1;
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
function htmlEscape(v){
  return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim();
    const sourceUrl=new URL(source);
    sourceUrl.searchParams.set('_ts', String(Date.now()));
    const r=await fetch(sourceUrl.toString(),{cache:'no-store'});
    const body=await r.text();

    if(String(req.query?.format||'').toLowerCase()==='seo-hub'){
        const unique=new Map();
        for(const row of objects){
          const title=row.Judul||row.judul||row.Title||row.title||'';
          const link=row.Link||row.link||'';
          if(!title) continue;
          if(isSeries(row)&&episodeNumber(title)>1) continue;
          const type=isSeries(row)?'tv':'movie';
          const clean=cleanTitle(title);
          const key=type+'|'+clean.toLowerCase();
          if(unique.has(key)) continue;
          const year=row.Tahun||row.tahun||row.Year||row.year||'';
          const genre=row.Genre||row.genre||'';
          const loc=BASE_URL+'/'+type+'/'+hashStable(title,type,link)+'/'+slugify(clean);
          unique.set(key,{title:clean,type,year,genre,loc});
        }
        const items=[...unique.values()].sort((a,b)=>{
          if(a.type!==b.type) return a.type==='movie'?-1:1;
          const ay=parseInt(a.year,10), by=parseInt(b.year,10);
          if(Number.isFinite(ay)&&Number.isFinite(by)&&ay!==by) return by-ay;
          return a.title.localeCompare(b.title,'id',{sensitivity:'base'});
        });
        const cards=items.map(item=>{
          const typeLabel=item.type==='tv'?'Series':'Film';
          const meta=[typeLabel,item.year,item.genre].filter(Boolean).join(' • ');
          return '<article class="card"><a href="'+htmlEscape(item.loc)+'"><div class="type">'+htmlEscape(typeLabel)+'</div><h2>'+htmlEscape(item.title)+'</h2><p>'+htmlEscape(meta)+'</p></a></article>';
        }).join('');
        const titleCount=items.length;
        const html='<!doctype html><html lang="id"><head>'+
          '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
          '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">'+
          '<link rel="canonical" href="'+BASE_URL+'/pustaka">'+
          '<link rel="icon" href="/favicon.svg" type="image/svg+xml">'+
          '<title>Pustaka Film & Series Indonesia - NontonGratisan</title>'+
          '<meta name="description" content="Pustaka film dan series NontonGratisan berisi '+titleCount+' judul dari katalog terbaru, lengkap dengan tahun dan genre.">'+
          '<style>body{margin:0;background:#09090b;color:#f4f4f5;font:16px/1.6 Arial,sans-serif}main{max-width:1180px;margin:auto;padding:28px 18px 56px}a{color:#fff;text-decoration:none}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.back{display:inline-block;padding:9px 13px;border:1px solid #27272a;border-radius:10px;color:#93c5fd}.muted{color:#a1a1aa}h1{font-size:clamp(28px,5vw,44px);margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}@media(min-width:700px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(min-width:1100px){.grid{grid-template-columns:repeat(6,minmax(0,1fr))}}.card{background:#121217;border:1px solid #27272a;border-radius:14px;min-width:0}.card a{display:block;padding:14px}.card:hover{border-color:#3b82f6}.type{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#60a5fa;font-weight:800}.card h2{font-size:15px;line-height:1.35;margin:7px 0 4px}.card p{margin:0;color:#a1a1aa;font-size:12px}.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.links a{border:1px solid #27272a;padding:8px 11px;border-radius:9px;color:#93c5fd}footer{margin-top:42px;padding-top:18px;border-top:1px solid #27272a;color:#71717a;font-size:13px}</style>'+
          '</head><body><main><div class="top"><div><h1>Pustaka Film & Series</h1><div class="muted">Daftar '+titleCount+' judul dari katalog NontonGratisan.</div></div><a class="back" href="/">← Kembali ke beranda</a></div>'+
          '<div class="links"><a href="/movies">Semua Film</a><a href="/tv">Semua Series</a><a href="/search">Cari Judul</a><a href="/dukung.html">Dukung NontonGratisan</a></div>'+
          '<section class="grid">'+cards+'</section>'+
          '<footer>Halaman pustaka ini dibuat dari katalog terbaru dan diperbarui otomatis saat data sumber berubah.</footer></main></body></html>';
        res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.status(200).send(html);
      }

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
         {loc:BASE_URL+'/pustaka',changefreq:'daily',priority:'0.8'},
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
        const clean=cleanTitle(title);
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

    res.setHeader('Cache-Control','no-store, no-cache, max-age=0, s-maxage=0, stale-while-revalidate=0, must-revalidate');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    return res.status(r.status).send(body);
  }catch(e){
    return res.status(502).json({error:e.message||'Catalog proxy gagal'});
  }
}
