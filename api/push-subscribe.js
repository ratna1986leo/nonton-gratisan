const PROJECT_NUMBER=process.env.GCP_PROJECT_NUMBER||'246566536973';
const POOL_ID=process.env.GCP_WORKLOAD_IDENTITY_POOL_ID||'vercel';
const PROVIDER_ID=process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID||'vercel';
const SERVICE_ACCOUNT=process.env.GCP_SERVICE_ACCOUNT_EMAIL||'nova-vercel@apis-dan-services.iam.gserviceaccount.com';
const STS_AUDIENCE='//iam.googleapis.com/projects/'+PROJECT_NUMBER+'/locations/global/workloadIdentityPools/'+POOL_ID+'/providers/'+PROVIDER_ID;
const SHEET_ID=process.env.GOOGLE_SHEET_ID||'1yRbeSYw0PdbM_tZmjjgKd3v41B7yMMQNa-GTesgp3Lk';
const SHEET_NAME='PushSubscriptions';
async function googleAuth(){
  const {getVercelOidcToken}=await import('@vercel/oidc');
  const {ExternalAccountClient}=await import('google-auth-library');
  return ExternalAccountClient.fromJSON({type:'external_account',audience:STS_AUDIENCE,subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SERVICE_ACCOUNT+':generateAccessToken',subject_token_supplier:{getSubjectToken:getVercelOidcToken},scopes:['https://www.googleapis.com/auth/spreadsheets']});
}
async function ensureSheet(){
  const auth=await googleAuth();
  const meta=(await auth.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'?fields=sheets.properties',method:'GET'})).data;
  if((meta.sheets||[]).some(x=>x.properties?.title===SHEET_NAME))return;
  await auth.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+':batchUpdate',method:'POST',headers:{'Content-Type':'application/json'},data:{requests:[{addSheet:{properties:{title:SHEET_NAME}}}]}});
}
function auth(req){const expected=process.env.NOVA_ADMIN_KEY;return !!expected&&(req.headers['x-nova-key']||req.body?.adminKey||'')===expected;}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{}, sub=b.subscription;
    if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return res.status(400).json({error:'Subscription tidak lengkap'});
    await ensureSheet();
    const authClient=await googleAuth();
    const range=encodeURIComponent(SHEET_NAME+'!A:F');
    const values=(await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+range,method:'GET'})).data?.values||[];
    const row=[String(sub.endpoint).slice(0,2000),String(sub.keys.p256dh),String(sub.keys.auth),String(b.userAgent||'').slice(0,500),new Date().toISOString(),'active'];
    const idx=values.slice(1).findIndex(r=>String(r?.[0]||'')===row[0]);
    if(idx>=0){
      const n=idx+2;
      await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+encodeURIComponent(SHEET_NAME+'!A'+n+':F'+n)+'?valueInputOption=RAW',method:'PUT',headers:{'Content-Type':'application/json'},data:{majorDimension:'ROWS',values:[row]}});
    }else{
      if(!values.length)await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+range+':append?valueInputOption=RAW',method:'POST',headers:{'Content-Type':'application/json'},data:{majorDimension:'ROWS',values:[['Endpoint','P256DH','Auth','User Agent','Updated At','Status']]}});
      await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+range+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',method:'POST',headers:{'Content-Type':'application/json'},data:{majorDimension:'ROWS',values:[row]}});
    }
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:e.message||'Server error'});}
}