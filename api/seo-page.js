const DEFAULT_CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';
const BASE_URL='https://nonton-gratisan.vercel.app';

function parseCSV(text){
  const rows=[];let row=[],v='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){
      if(q&&next==='"'){v+='"';i++}else q=!q;
    }else if(ch===','&&!q){row.push(v);v=''}
    else if((ch==='\\n'||ch==='\\r')&&!q){
      if(ch==='\\r'&&next==='\\n')i++;
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

function isSeries(row){
  const title=String(row.Judul||row.judul||'').toLowerCase();
  const genre=String(row.Genre||row.genre||'').toLowerCase();
  const type=String(row.Tipe||row.Type||row.Jenis||'').toLowerCase();
  return /series|tv|serial|drakor/.test(type) ||
    /series|tv series|tv-series|drakor|k-drama|k drama|drama korea|series korea|series asia|series indonesia|series barat|series india|tv korea|tv asia|tv indonesia|tv barat|tv india/.test(genre) ||
    /\\b(?:season|series|episode|ep)\\s*\\d*\\b/i.test(title) ||
    /\\bbag(?:ian)?\\s*\\d+\\b/i.test(title) ||
    /\\[\\s*\\d{1,3}\\s*\\]/.test(title);
}

function cleanTitle(title){
  return String(title||'')
    .replace(/^Nonton\\s*/i,'')
    .replace(/[\\(\\[]\\s*\\d{4}\\s*[\\)\\]]/g,'')
    .replace(/Series\\s*Sub\\s*Indo/gi,'')
    .replace(/Sub\\s*Indo(?:nesia)?/gi,'')
    .replace(/\\[\\s*\\d+\\s*\\]/g,'')
    .replace(/Ep(?:isode)?\\s*\\d+/gi,'')
    .replace(/\\bBag(?:ian)?\\s*\\d+\\b/gi,'')
    .trim() || String(title||'Tanpa Judul');
}

function esc(v){
  return String(v??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function json(v){ return JSON.stringify(v).replace(/</g,'\\u003c'); }

async function getCatalogItem(id,type){
  const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim();
  const sourceUrl=new URL(source);
  sourceUrl.searchParams.set('_seo', '1');
  const r=await fetch(sourceUrl.toString(),{cache:'no-store'});
  if(!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
  const body=await r.text();
  const rows=parseCSV(body);
  if(!rows.length) return null;
  const headers=rows[0].map(x=>String(x||'').trim());
  for(const raw of rows.slice(1)){
    if(!raw.some(v=>String(v||'').trim()!=='')) continue;
    const row=Object.fromEntries(headers.map((h,i)=>[h,String(raw[i]??'').trim()]));
    const title=row.Judul||row.judul||row.Title||row.title||'';
    const link=row.Link||row.link||'';
    if(!title) continue;
    const rowType=isSeries(row)?'tv':'movie';
    if(rowType!==type) continue;
    if(String(hashStable(title,rowType,link))===String(id)){
      return {
        id:String(id),
        type:rowType,
        title:cleanTitle(title),
        rawTitle:title,
        description:row.Deskripsi||row.deskripsi||row.Description||'Nonton dan simak detail lengkap film atau series ini di NontonGratisan.',
        year:row.Tahun||row.Tahun_Rilis||row.Year||'',
        rating:row.Rating||'',
        genre:row.Genre||row.genre||(rowType==='tv'?'TV Series':'Movie'),
        poster:row.Poster||row.poster||'',
        actors:row.Aktor||row.aktor||row.Actors||''
      };
    }
  }
  return null;
}

function updateTag(html, selector, value){
  const safe=esc(value);
  const re=new RegExp(`(<meta\\s+${selector}\\s+content=")[^"]*(")`, 'i');
  if(re.test(html)) return html.replace(re, `$1${safe}$2`);
  return html;
}
function updateLink(html, rel, value){
  const safe=esc(value);
  const re=new RegExp(`(<link\\s+rel="${rel}"\\s+href=")[^"]*(")`, 'i');
  if(re.test(html)) return html.replace(re, `$1${safe}$2`);
  return html;
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).send('Method not allowed');
  const type=String(req.query?.type||'').toLowerCase();
  const id=String(req.query?.id||'').trim();
  const slug=String(req.query?.slug||'').trim();
  if(!['movie','tv'].includes(type)||!id) return res.status(404).send('Not found');

  try{
    const [page,item]=await Promise.all([
      fetch(`${BASE_URL}/index.html?seo-template=1`,{cache:'no-store'}).then(r=>{
        if(!r.ok) throw new Error(`Template HTTP ${r.status}`);
        return r.text();
      }),
      getCatalogItem(id,type)
    ]);

    if(!item){
      res.setHeader('Cache-Control','public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.status(200).send(page);
    }

    const canonical=`${BASE_URL}/${type}/${encodeURIComponent(id)}/${encodeURIComponent(slug||item.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''))}`;
    const description=String(item.description||'').replace(/\\s+/g,' ').trim().slice(0,155);
    const image=String(item.poster||'').startsWith('http') ? String(item.poster) : '';
    const title=`Nonton ${item.title} Subtitle Indonesia - NontonGratisan`;

    let html=page;
    html=html.replace(/<title>[^<]*<\\/title>/i,`<title>${esc(title)}</title>`);
    html=html.replace(/<meta name="description" content="[^"]*">/i,`<meta name="description" content="${esc(description)}">`);
    html=html.replace(/<meta name="robots" content="[^"]*">/i,'<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">');
    html=html.replace(/<meta name="googlebot" content="[^"]*">/i,'<meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">');
    html=html.replace(/<link rel="canonical" href="[^"]*"/i,`<link rel="canonical" href="${esc(canonical)}"`);
    html=html.replace(/<link rel="alternate" hreflang="id-ID" href="[^"]*"/i,`<link rel="alternate" hreflang="id-ID" href="${esc(canonical)}"`);
    html=html.replace(/<meta property="og:type" content="[^"]*">/i,`<meta property="og:type" content="${type==='tv'?'video.tv_show':'video.movie'}">`);
    html=html.replace(/<meta property="og:title" content="[^"]*">/i,`<meta property="og:title" content="${esc(title)}">`);
    html=html.replace(/<meta property="og:description" content="[^"]*">/i,`<meta property="og:description" content="${esc(description)}">`);
    html=html.replace(/<meta property="og:url" content="[^"]*">/i,`<meta property="og:url" content="${esc(canonical)}">`);
    if(image){
      html=html.replace(/<meta property="og:image" content="[^"]*">/i,`<meta property="og:image" content="${esc(image)}">`);
      html=html.replace(/<meta name="twitter:image" content="[^"]*">/i,`<meta name="twitter:image" content="${esc(image)}">`);
    }
    html=html.replace(/<meta name="twitter:title" content="[^"]*">/i,`<meta name="twitter:title" content="${esc(title)}">`);
    html=html.replace(/<meta name="twitter:description" content="[^"]*">/i,`<meta name="twitter:description" content="${esc(description)}">`);

    const schema={
      '@context':'https://schema.org',
      '@type':type==='tv'?'TVSeries':'Movie',
      name:item.title,
      url:canonical,
      mainEntityOfPage:{'@type':'WebPage','@id':canonical},
      description,
      image:image?[image]:undefined,
      inLanguage:'id-ID',
      isAccessibleForFree:true,
      genre:String(item.genre||'').split(',').map(x=>x.trim()).filter(Boolean)
    };
    if(item.actors) schema.actor=String(item.actors).split(',').map(name=>({'@type':'Person',name:name.trim()})).filter(x=>x.name);
    const breadcrumb={
      '@context':'https://schema.org',
      '@type':'BreadcrumbList',
      itemListElement:[
        {'@type':'ListItem',position:1,name:'Beranda',item:BASE_URL+'/'},
        {'@type':'ListItem',position:2,name:type==='tv'?'TV Series':'Film',item:BASE_URL+'/'+type},
        {'@type':'ListItem',position:3,name:item.title,item:canonical}
      ]
    };
    html=html.replace(/<script type="application\\/ld\\+json" id="dynamic-media-jsonld">.*?<\\/script>/is,`<script type="application/ld+json" id="dynamic-media-jsonld">${json(schema)}</script>`);
    html=html.replace(/<script type="application\\/ld\\+json" id="breadcrumb-jsonld">.*?<\\/script>/is,`<script type="application/ld+json" id="breadcrumb-jsonld">${json(breadcrumb)}</script>`);

    res.setHeader('Cache-Control','public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.status(200).send(html);
  }catch(e){
    return res.status(502).send('SEO page error');
  }
}
