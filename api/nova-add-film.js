const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const GCP_PROJECT_NUMBER=process.env.GCP_PROJECT_NUMBER||'246566536973';
const GCP_WORKLOAD_IDENTITY_POOL_ID=process.env.GCP_WORKLOAD_IDENTITY_POOL_ID||'vercel';
const GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID||'vercel';
const GCP_SERVICE_ACCOUNT_EMAIL=process.env.GCP_SERVICE_ACCOUNT_EMAIL||'nova-vercel@apis-dan-services.iam.gserviceaccount.com';
const GCP_STS_AUDIENCE='//iam.googleapis.com/projects/'+GCP_PROJECT_NUMBER+'/locations/global/workloadIdentityPools/'+GCP_WORKLOAD_IDENTITY_POOL_ID+'/providers/'+GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
const SHEET_ID=process.env.GOOGLE_SHEET_ID||'1yRbeSYw0PdbM_tZmjjgKd3v41B7yMMQNa-GTesgp3Lk';
const SHEET_RANGE=process.env.GOOGLE_SHEET_RANGE||'A:Z';
const TMDB_API_KEY=process.env.TMDB_API_KEY||'';

async function googleAuth(){
  const {getVercelOidcToken}=await import('@vercel/oidc');
  const {ExternalAccountClient}=await import('google-auth-library');
  const authClient=ExternalAccountClient.fromJSON({
    type:'external_account',
    audience:GCP_STS_AUDIENCE,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+GCP_SERVICE_ACCOUNT_EMAIL+':generateAccessToken',
    subject_token_supplier:{getSubjectToken:getVercelOidcToken},
    scopes:['https://www.googleapis.com/auth/spreadsheets']
  });
  return authClient;
}
function auth(req){
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected)throw Object.assign(new Error('NOVA_ADMIN_KEY belum disetel di Vercel'),{status:503});
  const supplied=req.body?.adminKey||req.headers['x-nova-key']||'';
  if(supplied!==expected)throw Object.assign(new Error('Admin key salah'),{status:401});
}
function norm(s){return String(s??'').trim().toLowerCase().replace(/[ _-]+/g,'');}
function decodeHtml(s){return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'");}
function extractPlayerUrls(input){
  const text=decodeHtml(input);
  const out=[]; const add=(u)=>{const x=String(u||'').trim().replace(/^['"]|['"]$/g,'');if(/^https?:\/\//i.test(x)&&!out.includes(x))out.push(x);};
  let m;
  const attr=/(?:src|href|data-src|data-url|content)=\s*["']([^"']+)["']/gi;
  while((m=attr.exec(text)))add(m[1]);
  const plain=/(https?:\/\/[^\s"'<>]+)/gi;
  while((m=plain.exec(text)))add(m[1].replace(/[),;]+$/,''));
  return out.slice(0,10);
}
function extractPlayerUrl(input){return extractPlayerUrls(input)[0]||'';}
function findHeaderByNames(headers,names){const wanted=names.map(norm);return headers.find(h=>wanted.includes(norm(h)))||'';}
function findCatalogPlayers(rows,q,year){
  if(!rows.length)return [];
  const headers=rows[0]||[];
  const titleHeader=findHeaderByNames(headers,['judul','title','name'])||headers[0];
  const yearHeader=findHeaderByNames(headers,['tahun','year']);
  const typeHeader=findHeaderByNames(headers,['tipe','type','jenis','kategori']);
  const linkHeader=findHeaderByNames(headers,['link','url','video','embed','source','player','embedurl']);
  if(!linkHeader)return [];
  const nq=norm(q),ny=String(year||'').slice(0,4);
  const scored=rows.slice(1).map((row,index)=>{
    const o=Object.fromEntries(headers.map((h,j)=>[h,String(row?.[j]??'').trim()]));
    const title=norm(o[titleHeader]); if(!title)return null;
    const urls=extractPlayerUrls(o[linkHeader]); if(!urls.length)return null;
    let score=0;
    if(title===nq)score+=1000;
    if(title.includes(nq))score+=500;
    if(nq.includes(title)&&title.length>=3)score+=250;
    const y=yearHeader?String(o[yearHeader]||'').slice(0,4):'';
    if(ny&&y===ny)score+=200;
    score+=100;
    return {rowNumber:index+2,title:o[titleHeader]||'',year:yearHeader?o[yearHeader]||'':'',type:typeHeader?o[typeHeader]||'':'',urls,score};
  }).filter(Boolean).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,15);
  return scored.map(({score,...x})=>x);
}

function parseHeaders(values){return values[0]||[];}
async function sheetsGet(range){
  const authClient=await googleAuth();
  const r=await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+encodeURIComponent(range),method:'GET'});
  return r.data?.values||[];
}
async function sheetsAppend(values){
  const authClient=await googleAuth();
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+encodeURIComponent(SHEET_RANGE)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=true';
  const r=await authClient.request({url,method:'POST',headers:{'Content-Type':'application/json'},data:{majorDimension:'ROWS',values:[values]}});
  return r.data;
}
async function tmdbLookup(title,year='',tmdbId=''){
  if(!TMDB_API_KEY)throw new Error('TMDB_API_KEY belum disetel di Vercel');
  const u='https://api.themoviedb.org/3/search/multi?api_key='+encodeURIComponent(TMDB_API_KEY)+'&language=id-ID&query='+encodeURIComponent(title)+'&include_adult=false';
  const r=await fetch(u,{headers:{accept:'application/json'}}),j=await r.json();
  if(!r.ok)throw new Error(j.status_message||'TMDB gagal');
  const results=(j.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv');
  const wanted=String(year||'').trim();
  const getYear=x=>String((x.media_type==='tv'?x.first_air_date:x.release_date)||'').slice(0,4);
  const requestedId=String(tmdbId||'').trim();
  const ranked=results.slice().sort((a,b)=>{
    const ay=getYear(a),by=getYear(b);
    const aId=requestedId && String(a.id)===requestedId ? 2 : 0;
    const bId=requestedId && String(b.id)===requestedId ? 2 : 0;
    const am=wanted&&ay===wanted?1:0,bm=wanted&&by===wanted?1:0;
    return (bId+bm)-(aId+am);
  });
  const item=ranked[0];
  if(!item)throw new Error('Film/series tidak ditemukan di TMDB');
  const isTv=item.media_type==='tv',type=isTv?'tv':'movie';
  let d=item;
  try{
    const dr=await fetch('https://api.themoviedb.org/3/'+type+'/'+item.id+'?api_key='+encodeURIComponent(TMDB_API_KEY)+'&language=id-ID&append_to_response=credits',{headers:{accept:'application/json'}});
    if(dr.ok)d=await dr.json();
  }catch{}
  const genres=Array.isArray(d.genres)?d.genres.map(x=>x.name).filter(Boolean).join(', '):'';
  const actors=Array.isArray(d.credits?.cast)?d.credits.cast.slice(0,8).map(x=>x.name).filter(Boolean).join(', '):'';
  const data={
    judul:isTv?(d.name||item.name||title):(d.title||item.title||title),
    tipe:isTv?'Series':'Film',
    tahun:String((isTv?d.first_air_date:d.release_date)||'').slice(0,4),
    genre:genres,poster:d.poster_path?'https://image.tmdb.org/t/p/w780'+d.poster_path:'',
    deskripsi:d.overview||'',rating:typeof d.vote_average==='number'?d.vote_average.toFixed(1):'',
    aktor:actors,tmdbId:item.id
  };
  return {data,candidates:ranked.slice(0,8).map(x=>({tmdbId:x.id,tipe:x.media_type==='tv'?'Series':'Film',judul:x.media_type==='tv'?(x.name||''):(x.title||''),tahun:getYear(x)}))};
}
function allowed(url){
  const domains=String(process.env.AUTHORIZED_EMBED_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!domains.length)return false;
  try{
    const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return domains.some(d=>host===d||host.endsWith('.'+d));
  }catch{return false}
}
function mapRow(headers,data){
  const aliases={
    judul:['judul','title','name'],tipe:['tipe','type','jenis'],tahun:['tahun','year'],
    genre:['genre'],poster:['poster','posterpath','image','gambar','thumbnail'],
    deskripsi:['deskripsi','description','overview','sinopsis'],link:['link','player','url','embed','embedurl'],
    rating:['rating'],aktor:['aktor','cast','actors']
  };
  return headers.map(h=>{
    const k=norm(h);
    for(const [field,names] of Object.entries(aliases))if(names.includes(k))return data[field]??'';
    return '';
  });
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    auth(req);
    const action=String(req.body?.action||'preview').trim();
    const title=String(req.body?.title||'').trim();
    const year=String(req.body?.year||'').trim();
    const requestedTMDBId=String(req.body?.tmdbId||'').trim();

    if(action==='find-player'){
      if(title.length<2)return res.status(400).json({error:'Query judul minimal 2 karakter'});
      const rows=await sheetsGet(SHEET_RANGE);
      const results=findCatalogPlayers(rows,title,year);
      return res.status(200).json({ok:true,results});
    }
    const rawLink=String(req.body?.link||'').trim();
    const playerLink=rawLink?extractPlayerUrl(rawLink):'';
    if(rawLink&&!playerLink)return res.status(400).json({error:'URL player/embed tidak dikenali. Gunakan URL http(s) atau kode iframe/embed yang memiliki src/href.'});
    if(!title)return res.status(400).json({error:'Judul film wajib diisi'});
    const lookup=await tmdbLookup(title,year,requestedTMDBId); const data=lookup.data;
    data.link=playerLink;
    const authorizedDomains=String(process.env.AUTHORIZED_EMBED_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(action==='preview')return res.status(200).json({ok:true,readOnly:true,data,candidates:lookup.candidates,authorizedDomains,selectedTMDBId:requestedTMDBId||String(data.tmdbId||'')});
    if(action!=='save')return res.status(400).json({error:'Action tidak dikenal'});
    const headers=await sheetsGet('1:1');
    if(!headers.length)throw new Error('Header Google Sheet tidak ditemukan');
    const headerRow=parseHeaders(headers);
    const findHeader=(...names)=>headerRow.find(h=>names.includes(norm(h)));
    const existing=await sheetsGet(SHEET_RANGE);
    const titleHeader=findHeader('judul','title','name');
    const yearHeader=findHeader('tahun','year');
    const typeHeader=findHeader('tipe','type','jenis');
    const canonical=(value)=>String(value||'')
      .normalize('NFKD')
      .replace(/[\\u0300-\\u036f]/g,'')
      .toLowerCase()
      .replace(/^nonton\\s*/i,'')
      .replace(/\\[\\s*\\d{4}\\s*\\]/g,'')
      .replace(/sub\\s*indo(?:nesia)?/gi,'')
      .replace(/[^a-z0-9]+/g,'')
      .trim();
    const newTitleKey=canonical(data.judul);
    const newYear=String(data.tahun||'').trim();
    if(titleHeader && existing.length>1){
      for(let i=1;i<existing.length;i++){
        const rowObj=Object.fromEntries(headerRow.map((h,j)=>[h,String(existing[i]?.[j]??'').trim()]));
        const existingTitleKey=canonical(rowObj[titleHeader]);
        const existingYear=yearHeader?String(rowObj[yearHeader]||'').trim():'';
        const sameTitle=Boolean(newTitleKey)&&existingTitleKey===newTitleKey;
        // Karena fitur ini memang mendeteksi judul + tahun, tahun kosong TIDAK
        // boleh dianggap sama dengan tahun baru. Ini mencegah false duplicate.
        const sameYear=Boolean(yearHeader&&newYear&&existingYear&&existingYear===newYear);
        if(sameTitle&&sameYear){
          return res.status(409).json({
            ok:false,
            duplicate:true,
            rowNumber:i+1,
            existing:{
              judul:rowObj[titleHeader]||'',
              tahun:existingYear,
              tipe:typeHeader?rowObj[typeHeader]||'':''
            },
            error:'Film/series dengan judul dan tahun yang sama sudah ada di Google Sheet.'
          });
        }
      }
    }
    const row=mapRow(headerRow,data);
    if(!row.some(Boolean))throw new Error('Kolom Google Sheet tidak cocok dengan field film');
    const saved=await sheetsAppend(row);
    // Notifikasi push tidak boleh menggagalkan proses simpan film.
    if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){
      try{
        await fetch('https://nonton-gratisan.vercel.app/api/push-send',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-nova-key':process.env.NOVA_ADMIN_KEY||''},
          body:JSON.stringify({
            title:'🎬 Film baru di NontonGratisan',
            body:data.judul+(data.tahun?' ('+data.tahun+')':'')+' sudah masuk pustaka.',
            url:'/?q='+encodeURIComponent(data.judul),
            tag:'film-baru'
          }),
          signal:AbortSignal.timeout(5000)
        });
      }catch(_){}
    }
    return res.status(200).json({ok:true,saved:true,data});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Server error'});}
}