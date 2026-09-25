const BASE_URL='https://nonton-gratisan.vercel.app';
const SHEET_URL=String(process.env.GOOGLE_SHEETS_CSV_URL||'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv').trim();
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function slugify(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/gi,'-').replace(/^-+|-+$/g,'')||'film';}
function hashStable(title,type,link){const source=String(type||'movie')+'|'+String(title||'').trim().toLowerCase()+'|'+String(link||'').trim();let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}return Math.abs(hash>>>0)||1;}
function parseCSV(text){const rows=[];let row=[],v='',q=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(q&&next==='"'){v+='"';i++}else q=!q}else if(ch===','&&!q){row.push(v);v=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&next==='\n')i++;row.push(v);v='';if(row.some(x=>String(x||'').trim()!==''))rows.push(row);row=[]}else v+=ch}row.push(v);if(row.some(x=>String(x||'').trim()!==''))rows.push(row);return rows;}
function isSeries(row){const title=String(row.Judul||row.judul||'').toLowerCase();const genre=String(row.Genre||row.genre||'').toLowerCase();const type=String(row.Tipe||row.Type||row.Jenis||'').toLowerCase();return /series|tv|serial|drakor/.test(type)||/series|tv series|tv-series|drakor|k-drama|k drama|drama korea|series korea|series asia|series indonesia|series barat|series india|tv korea|tv asia|tv indonesia|tv barat|tv india/.test(genre)||/\b(?:season|series|episode|ep)\s*\d*\b/i.test(title)||/\bbag(?:ian)?\s*\d+\b/i.test(title)||/\[\s*\d{1,3}\s*\]/.test(title);}
async function getLibraryMedia(id,type){try{const r=await fetch(SHEET_URL,{cache:'no-store'});if(!r.ok)return null;const rows=parseCSV(await r.text());if(rows.length<2)return null;const headers=rows[0].map(x=>String(x||'').trim());for(const arr of rows.slice(1)){const row=Object.fromEntries(headers.map((h,i)=>[h,String(arr[i]??'').trim()]));const title=row.Judul||row.judul||'';const link=row.Link||row.link||'';if(!title||isSeries(row)!==(type==='tv'))continue;if(String(hashStable(title,type,link))===String(id))return {title,year:row.Tahun||'',overview:row.Deskripsi||'',image:row.Poster||''};}}catch(e){}return null;}
async function getTMDBMedia(id,type){const key=String(process.env.TMDB_API_KEY||'').trim();if(!key||!/^[0-9]+$/.test(String(id)))return null;try{const path='https://api.themoviedb.org/3/'+type+'/'+encodeURIComponent(id)+'?api_key='+encodeURIComponent(key)+'&language=id-ID';const r=await fetch(path,{cache:'no-store'});if(!r.ok)return null;const d=await r.json();return {title:type==='tv'?(d.name||d.original_name):(d.title||d.original_title),year:(type==='tv'?d.first_air_date:d.release_date||'').slice(0,4),overview:d.overview||'',image:d.backdrop_path?'https://image.tmdb.org/t/p/w1280'+d.backdrop_path:(d.poster_path?'https://image.tmdb.org/t/p/w780'+d.poster_path:'')};}catch(e){return null}}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).send('Method not allowed');
 try{
  const type=String(req.query?.type||'').toLowerCase(),id=String(req.query?.id||'').trim(),slug=String(req.query?.slug||'').trim();
  if(!['movie','tv'].includes(type)||!id)return res.status(400).send('Bad route');
  let media=await getTMDBMedia(id,type);if(!media)media=await getLibraryMedia(id,type);
  const fallback=slug.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim()||'Film '+id;
  const name=String(media?.title||fallback).replace(/^Nonton\s*/i,'').replace(/Sub\s*Indo(?:nesia)?/i,'').trim();
  const year=media?.year?String(media.year):'';
  const title='Nonton '+name+(year?' ('+year+')':'')+' Subtitle Indonesia - NontonGratisan';
  const description=(media?.overview?String(media.overview).replace(/\s+/g,' ').trim().slice(0,155):'Nonton '+name+' subtitle Indonesia. Lihat informasi, rating, genre, dan detail '+(type==='tv'?'series':'film')+' di NontonGratisan.');
  const canonical=BASE_URL+'/'+type+'/'+encodeURIComponent(id)+'/'+slugify(name);
  const index=await fetch(BASE_URL+'/index.html',{cache:'no-store'});if(!index.ok)throw new Error('index.html gagal dimuat');
  let html=await index.text();
  html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+esc(title)+'</title>');
  html=html.replace(/<meta\s+name="description"[^>]*>/i,'<meta name="description" content="'+esc(description)+'">');
  html=html.replace(/<link\s+rel="canonical"[^>]*>/i,'<link rel="canonical" href="'+esc(canonical)+'">');
  html=html.replace(/<meta\s+property="og:title"[^>]*>/i,'<meta property="og:title" content="'+esc(title)+'">');
  html=html.replace(/<meta\s+property="og:description"[^>]*>/i,'<meta property="og:description" content="'+esc(description)+'">');
  html=html.replace(/<meta\s+property="og:url"[^>]*>/i,'<meta property="og:url" content="'+esc(canonical)+'">');
  if(media?.image)html=html.replace(/<meta\s+property="og:image"[^>]*>/i,'<meta property="og:image" content="'+esc(media.image)+'">');
  html=html.replace(/<link\s+rel="alternate" hreflang="id-ID"[^>]*>/i,'<link rel="alternate" hreflang="id-ID" href="'+esc(canonical)+'">');
  const schema={'@context':'https://schema.org','@type':type==='tv'?'TVSeries':'Movie',name:name,url:canonical,inLanguage:'id-ID',description:description};
  if(media?.image)schema.image=media.image;if(year)schema.dateCreated=year;
  html=html.replace('<script type="application/ld+json" id="dynamic-media-jsonld">{}</script>','<script type="application/ld+json" id="dynamic-media-jsonld">'+JSON.stringify(schema)+'</script>');
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=1800');res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).send(html);
 }catch(e){return res.status(500).send('SEO page error')}
}