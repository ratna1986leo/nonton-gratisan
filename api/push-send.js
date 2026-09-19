import webpush from 'web-push';
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
function auth(req){const expected=process.env.NOVA_ADMIN_KEY;return !!expected&&(req.headers['x-nova-key']||req.body?.adminKey||'')===expected;}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!auth(req))return res.status(401).json({error:'Admin key salah'});
  const pub=process.env.VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY;
  if(!pub||!priv)return res.status(503).json({error:'VAPID keys belum disetel di Vercel'});
  try{
    webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@nonton-gratisan.vercel.app',pub,priv);
    const authClient=await googleAuth();
    const values=(await authClient.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+encodeURIComponent(SHEET_NAME+'!A:F'),method:'GET'})).data?.values||[];
    const payload=JSON.stringify({title:String(req.body?.title||'NontonGratisan'),body:String(req.body?.body||'Ada kabar baru dari NontonGratisan.'),url:String(req.body?.url||'/'),icon:'/favicon.svg',badge:'/favicon.svg',tag:String(req.body?.tag||'nonton-gratisan')});
    let sent=0,failed=0;
    for(const r of values.slice(1)){
      if(!r?.[0]||!r?.[1]||!r?.[2])continue;
      try{await webpush.sendNotification({endpoint:r[0],keys:{p256dh:r[1],auth:r[2]}},payload);sent++;}catch(_){failed++;}
    }
    return res.status(200).json({ok:true,sent,failed,total:sent+failed});
  }catch(e){return res.status(500).json({error:e.message||'Server error'});}
}