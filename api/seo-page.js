const DEFAULT_CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const BASE_URL='https://nonton-gratisan.vercel.app';

function parseCSV(text){
  const rows=[]; let row=[],v='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){ if(q&&next==='"'){v+='"';i++;}else q=!q; }
    else if(ch===','&&!q){row.push(v);v='';}
    else if((ch==='\\n'||ch==='\\r')&&!q){ if(ch==='\\r'&&next==='\\n')i++; row.push(v);v=''; if(row.some(x=>String(x||'').trim()!==''))rows.push(row);row=[]; }
    else v+=ch;
  }
  row.push(v); if(row.some(x=>String(x||'').trim()!==''))rows.push(row); return rows;
}
function hashStable(title,type,link){
  const source=String(type||'movie')+'|'+String(title||'').trim().toLowerCase()+'|'+String(link||'').trim();
  let hash=2166136261;
  for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return Math.abs(hash>>>0)||1;
}
function slugify(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\\u00c0-\\u024f]+/gi,'-').replace(/^-+|-+$/g,'')||'film';}
function isSeries(row){
  const title=String(row.Judul||row.judul||'').toLowerCase(),genre=String(row.Genre||row.genre||'').toLowerCase(),type=String(row.Tipe||row.Type||row.Jenis||'').toLowerCase();
  return /series|tv|serial|drakor/.test(type)||/series|tv series|tv-series|drakor|k-drama|k drama|drama korea|series korea|series asia|series indonesia|series barat|series india|tv korea|tv asia|tv indonesia|tv barat|tv india/.test(genre)||/\\b(?:season|series|episode|ep)\\s*\\d*\\b/i.test(title)||/\\bbag(?:ian)?\\s*\\d+\\b/i.test(title)||/\\[\\s*\\d{1,3}\\s*\\]/.test(title);
}
function first(row,keys){for(const k of keys){if(row[k]!==undefined&&String(row[k]).trim()!=='')return String(row[k]).trim();}return '';}
function cleanTitle(title){return String(title||'').replace(/^Nonton\\s*/i,'').replace(/[\\(\\[]\\s*\\d{4}\\s*[\\)\\]]/g,'').replace(/Series\\s*Sub\\s*Indo/gi,'').replace(/Sub\\s*Indo(?:nesia)?/gi,'').replace(/\\[\\s*\\d+\\s*\\]/g,'').replace(/Ep(?:isode)?\\s*\\d+/gi,'').replace(/\\bBag(?:ian)?\\s*\\d+\\b/gi,'').trim()||'Tanpa Judul';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function findItem(rows,id,type){
  const headers=rows[0]||[];
  for(const raw of rows.slice(1)){
    const row=Object.fromEntries(headers.map((h,i)=>[String(h||'').trim(),String(raw[i]??'').trim()]));
    const title=first(row,['Judul','judul','Title','title']),link=first(row,['Link','link','playerLink','playerUrl','player_url']);
    if(title&&((isSeries(row)?'tv':'movie')===type)&&String(hashStable(title,type,link))===String(id))return row;
  }
  return null;
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).send('Method not allowed');
  const type=req.query?.type==='tv'?'tv':'movie',id=String(req.query?.id||'').trim();
  if(!/^\\d+$/.test(id))return res.status(404).send('Not found');
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim(),u=new URL(source);
    u.searchParams.set('_ts',String(Date.now()));
    const r=await fetch(u.toString(),{cache:'no-store'}); if(!r.ok)return res.status(502).send('Catalog unavailable');
    const rows=parseCSV(await r.text()),row=findItem(rows,id,type); if(!row)return res.status(404).send('Not found');
    const title=cleanTitle(first(row,['Judul','judul','Title','title']));
    const year=first(row,['Tahun','tahun','Year','year']);
    const genre=first(row,['Genre','genre']);
    const overview=first(row,['Deskripsi','DESKRIPSI','deskripsi','Description','description','Overview','overview']);
    const actors=first(row,['Aktor','AKTOR','aktor','Actors','actors']);
    const poster=first(row,['Poster','poster','PosterURL','poster_url','Gambar','gambar','Image','image']);
    const canonical=BASE_URL+'/'+type+'/'+id+'/'+slugify(title);
    const fallback=(type==='tv'?'TV Series':'Film')+' '+title+' subtitle Indonesia di NontonGratisan. Lihat informasi, rating, genre, pemain, dan detail '+(type==='tv'?'series':'film')+'.';
    const description=String(overview||fallback).replace(/\\s+/g,' ').trim().slice(0,155).replace(/\\s+\\S*$/,'').trim();
    const mediaLabel=type==='tv'?'TV Series':'Film';
    const rawTitle='Nonton '+title+' Subtitle Indonesia - NontonGratisan';
    const pageTitle=rawTitle.length>58?rawTitle.slice(0,58).replace(/\\s+\\S*$/,'').trim():rawTitle;
    const image=poster||'https://image.tmdb.org/t/p/w1280/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg';
    const genres=genre.split(/[,|]/).map(x=>x.trim()).filter(Boolean);
    const cast=actors.split(/[,|]/).map(x=>x.trim()).filter(Boolean).slice(0,8).map(name=>({'@type':'Person',name:name}));
    const jsonLd={'@context':'https://schema.org','@type':type==='tv'?'TVSeries':'Movie',name:title,url:canonical,mainEntityOfPage:{'@type':'WebPage','@id':canonical},description:description,image:[image],inLanguage:'id-ID',isAccessibleForFree:true};
    if(genres.length)jsonLd.genre=genres;if(cast.length)jsonLd.actor=cast;
    const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'Beranda',item:BASE_URL+'/'},
      {'@type':'ListItem',position:2,name:mediaLabel,item:BASE_URL+'/'+type},
      {'@type':'ListItem',position:3,name:title,item:canonical}
    ]};
    const shell=await fetch(BASE_URL+'/',{cache:'no-store'});if(!shell.ok)return res.status(502).send('Site shell unavailable');
    let html=await shell.text();
    html=html.replace(/<title>[\\s\\S]*?<\\/title>/i,'<title>'+esc(pageTitle)+'</title>');
    const metas=[
      [/<meta name="description"[^>]*>/i,'<meta name="description" content="'+esc(description)+'">'],
      [/<link rel="canonical"[^>]*>/i,'<link rel="canonical" href="'+esc(canonical)+'">'],
      [/<meta property="og:title"[^>]*>/i,'<meta property="og:title" content="'+esc(pageTitle)+'">'],
      [/<meta property="og:description"[^>]*>/i,'<meta property="og:description" content="'+esc(description)+'">'],
      [/<meta property="og:url"[^>]*>/i,'<meta property="og:url" content="'+esc(canonical)+'">'],
      [/<meta property="og:type"[^>]*>/i,'<meta property="og:type" content="'+(type==='tv'?'video.tv_show':'video.movie')+'">'],
      [/<meta property="og:image"[^>]*>/i,'<meta property="og:image" content="'+esc(image)+'">'],
      [/<meta property="og:image:alt"[^>]*>/i,'<meta property="og:image:alt" content="'+esc(title)+'">'],
      [/<meta name="twitter:title"[^>]*>/i,'<meta name="twitter:title" content="'+esc(pageTitle)+'">'],
      [/<meta name="twitter:description"[^>]*>/i,'<meta name="twitter:description" content="'+esc(description)+'">'],
      [/<meta name="twitter:image"[^>]*>/i,'<meta name="twitter:image" content="'+esc(image)+'">'],
      [/<link rel="alternate" hreflang="id-ID"[^>]*>/i,'<link rel="alternate" hreflang="id-ID" href="'+esc(canonical)+'">']
    ];
    for(const m of metas)html=html.replace(m[0],m[1]);
    html=html.replace(/<script type="application\\/ld\\+json" id="dynamic-media-jsonld">[\\s\\S]*?<\\/script>/i,'<script type="application/ld+json" id="dynamic-media-jsonld">'+JSON.stringify(jsonLd)+'</script>');
    html=html.replace(/<script type="application\\/ld\\+json" id="breadcrumb-jsonld">[\\s\\S]*?<\\/script>/i,'<script type="application/ld+json" id="breadcrumb-jsonld">'+JSON.stringify(breadcrumb)+'</script>');
    const seo='<section id="server-seo-content" style="max-width:960px;margin:1rem auto;padding:1rem 1.25rem;color:#d4d4d8;background:#09090b"><nav aria-label="Breadcrumb"><a href="/">Beranda</a> › <a href="/'+type+'">'+esc(mediaLabel)+'</a> › <span>'+esc(title)+'</span></nav><h1>'+esc(title)+' Subtitle Indonesia</h1><p>'+esc(description)+'</p>'+(year?'<p>Tahun: '+esc(year)+'</p>':'')+(genre?'<p>Genre: '+esc(genre)+'</p>':'')+(actors?'<p>Pemeran: '+esc(actors)+'</p>':'')+'</section>';
    html=html.replace(/<body([^>]*)>/i,'<body$1>'+seo);
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.status(200).send(html);
  }catch(e){return res.status(500).send('SEO page error');}
}
