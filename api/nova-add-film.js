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
async function tmdbLookup(title,year=''){
  if(!TMDB_API_KEY)throw new Error('TMDB_API_KEY belum disetel di Vercel');
  const u='https://api.themoviedb.org/3/search/multi?api_key='+encodeURIComponent(TMDB_API_KEY)+'&language=id-ID&query='+encodeURIComponent(title)+'&include_adult=false';
  const r=await fetch(u,{headers:{accept:'application/json'}}),j=await r.json();
  if(!r.ok)throw new Error(j.status_message||'TMDB gagal');
  const results=(j.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv');
  const wanted=String(year||'').trim();
  const getYear=x=>String((x.media_type==='tv'?x.first_air_date:x.release_date)||'').slice(0,4);
  const ranked=results.slice().sort((a,b)=>{
    const ay=getYear(a),by=getYear(b);
    const am=wanted&&ay===wanted?1:0,bm=wanted&&by===wanted?1:0;
    return bm-am;
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
    if(!title)return res.status(400).json({error:'Judul film wajib diisi'});
    const lookup=await tmdbLookup(title,year); const data=lookup.data;
    const authorizedDomains=String(process.env.AUTHORIZED_EMBED_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(action==='preview')return res.status(200).json({ok:true,readOnly:true,data,candidates:lookup.candidates,authorizedDomains});
    if(action!=='save')return res.status(400).json({error:'Action tidak dikenal'});
    const headers=await sheetsGet('1:1');
    if(!headers.length)throw new Error('Header Google Sheet tidak ditemukan');
    const row=mapRow(parseHeaders(headers),data);
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