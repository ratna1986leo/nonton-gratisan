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

function first(row,keys){for(const k of keys){if(row[k]!==undefined&&String(row[k]).trim()!=='')return String(row[k]).trim();}return '';}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function findItem(rows,id,type){
  const headers=rows[0]||[];
  for(const raw of rows.slice(1)){
    const row=Object.fromEntries(headers.map((h,i)=>[String(h||'').trim(),String(raw[i]??'').trim()]));
    const title=first(row,['Judul','judul','Title','title']),link=first(row,['Link','link','playerLink','playerUrl','player_url']);
    if(title&&((isSeries(row)?'tv':'movie')===type)&&String(hashStable(title,type,link))===String(id))return row;
  }
  return null;
}

function xmlEscape(v){
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim();
    const sourceUrl=new URL(source);
    sourceUrl.searchParams.set('_ts', String(Date.now()));
    const r=await fetch(sourceUrl.toString(),{cache:'no-store'});
    const body=await r.text();


    const detailType=String(req.query?.type||'').toLowerCase();
    const detailId=String(req.query?.id||'').trim();
    if((detailType==='movie'||detailType==='tv') && /^\\d+$/.test(detailId)){
      const rows=parseCSV(body);
      const row=findItem(rows,detailId,detailType);
      if(!row)return res.status(404).send('Not found');
      const title=cleanTitle(first(row,['Judul','judul','Title','title']));
      const year=first(row,['Tahun','tahun','Year','year']);
      const genre=first(row,['Genre','genre']);
      const overview=first(row,['Deskripsi','DESKRIPSI','deskripsi','Description','description','Overview','overview']);
      const actors=first(row,['Aktor','AKTOR','aktor','Actors','actors']);
      const poster=first(row,['Poster','poster','PosterURL','poster_url','Gambar','gambar','Image','image']);
      const canonical=BASE_URL+'/'+detailType+'/'+detailId+'/'+slugify(title);
      const fallback=(detailType==='tv'?'TV Series':'Film')+' '+title+' subtitle Indonesia di NontonGratisan. Lihat informasi, rating, genre, pemain, dan detail '+(detailType==='tv'?'series':'film')+'.';
      const description=String(overview||fallback).replace(/\\s+/g,' ').trim().slice(0,155).replace(/\\s+\\S*$/,'').trim();
      const mediaLabel=detailType==='tv'?'TV Series':'Film';
      const rawTitle='Nonton '+title+' Subtitle Indonesia - NontonGratisan';
      const pageTitle=rawTitle.length>58?rawTitle.slice(0,58).replace(/\\s+\\S*$/,'').trim():rawTitle;
      const image=poster||'https://image.tmdb.org/t/p/w1280/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg';
      const genres=genre.split(/[,|]/).map(x=>x.trim()).filter(Boolean);
      const cast=actors.split(/[,|]/).map(x=>x.trim()).filter(Boolean).slice(0,8).map(name=>({'@type':'Person',name}));
      const jsonLd={'@context':'https://schema.org','@type':detailType==='tv'?'TVSeries':'Movie',name:title,url:canonical,mainEntityOfPage:{'@type':'WebPage','@id':canonical},description,image:[image],inLanguage:'id-ID',isAccessibleForFree:true};
      if(genres.length)jsonLd.genre=genres;
      if(cast.length)jsonLd.actor=cast;
      const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:'Beranda',item:BASE_URL+'/'},
        {'@type':'ListItem',position:2,name:mediaLabel,item:BASE_URL+'/'+detailType},
        {'@type':'ListItem',position:3,name:title,item:canonical}
      ]};
      const shell=await fetch('https://raw.githubusercontent.com/ratna1986leo/nonton-gratisan/main/index.html',{cache:'no-store'});
      if(!shell.ok)return res.status(502).send('Site shell unavailable');
      let html=await shell.text();
      html=html.replace(/<title>[\\s\\S]*?<\\/title>/i,'<title>'+escHtml(pageTitle)+'</title>');
      const metas=[
        [/<meta name="description"[^>]*>/i,'<meta name="description" content="'+escHtml(description)+'">'],
        [/<link rel="canonical"[^>]*>/i,'<link rel="canonical" href="'+escHtml(canonical)+'">'],
        [/<meta property="og:title"[^>]*>/i,'<meta property="og:title" content="'+escHtml(pageTitle)+'">'],
        [/<meta property="og:description"[^>]*>/i,'<meta property="og:description" content="'+escHtml(description)+'">'],
        [/<meta property="og:url"[^>]*>/i,'<meta property="og:url" content="'+escHtml(canonical)+'">'],
        [/<meta property="og:type"[^>]*>/i,'<meta property="og:type" content="'+(detailType==='tv'?'video.tv_show':'video.movie')+'">'],
        [/<meta property="og:image"[^>]*>/i,'<meta property="og:image" content="'+escHtml(image)+'">'],
        [/<meta property="og:image:alt"[^>]*>/i,'<meta property="og:image:alt" content="'+escHtml(title)+'">'],
        [/<meta name="twitter:title"[^>]*>/i,'<meta name="twitter:title" content="'+escHtml(pageTitle)+'">'],
        [/<meta name="twitter:description"[^>]*>/i,'<meta name="twitter:description" content="'+escHtml(description)+'">'],
        [/<meta name="twitter:image"[^>]*>/i,'<meta name="twitter:image" content="'+escHtml(image)+'">'],
        [/<link rel="alternate" hreflang="id-ID"[^>]*>/i,'<link rel="alternate" hreflang="id-ID" href="'+escHtml(canonical)+'">']
      ];
      for(const m of metas)html=html.replace(m[0],m[1]);
      html=html.replace(/<script type="application\\/ld\\+json" id="dynamic-media-jsonld">[\\s\\S]*?<\\/script>/i,'<script type="application/ld+json" id="dynamic-media-jsonld">'+JSON.stringify(jsonLd)+'</script>');
      html=html.replace(/<script type="application\\/ld\\+json" id="breadcrumb-jsonld">[\\s\\S]*?<\\/script>/i,'<script type="application/ld+json" id="breadcrumb-jsonld">'+JSON.stringify(breadcrumb)+'</script>');
      const seo='<section id="server-seo-content" style="max-width:960px;margin:1rem auto;padding:1rem 1.25rem;color:#d4d4d8;background:#09090b"><nav aria-label="Breadcrumb"><a href="/">Beranda</a> › <a href="/'+detailType+'">'+escHtml(mediaLabel)+'</a> › <span>'+escHtml(title)+'</span></nav><h1>'+escHtml(title)+' Subtitle Indonesia</h1><p>'+escHtml(description)+'</p>'+(year?'<p>Tahun: '+escHtml(year)+'</p>':'')+(genre?'<p>Genre: '+escHtml(genre)+'</p>':'')+(actors?'<p>Pemeran: '+escHtml(actors)+'</p>':'')+'</section>';
      html=html.replace(/<body([^>]*)>/i,'<body$1>'+seo);
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
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
