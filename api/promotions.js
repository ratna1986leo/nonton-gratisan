const crypto=require('crypto');

const DEFAULT_HEADERS=['ID','Status','Title','Description','Image','Link','Placement','Start','End','Impressions','Clicks','Created At'];

function auth(req){
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected)throw new Error('NOVA_ADMIN_KEY belum disetel');
  if(req.headers['x-nova-key']!==expected)throw new Error('Unauthorized');
}
function envSheet(){return process.env.PROMOTION_SHEET_ID||process.env.GOOGLE_SHEET_ID}
function parseSa(){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON belum disetel');
  const sa=JSON.parse(raw);
  if(!sa.client_email||!sa.private_key)throw new Error('Service account tidak lengkap');
  return sa;
}
function b64(v){return Buffer.from(v).toString('base64url')}
async function token(){
  const sa=parseSa(),now=Math.floor(Date.now()/1000);
  const head=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const pay=b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const input=head+'.'+pay,sign=crypto.createSign('RSA-SHA256');sign.update(input);sign.end();
  const assertion=input+'.'+b64(sign.sign(sa.private_key));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const j=await r.json();if(!r.ok)throw new Error(j.error_description||'Google OAuth gagal');return j.access_token;
}
async function sheets(path,opts={}){
  const id=envSheet();if(!id)throw new Error('PROMOTION_SHEET_ID belum disetel');
  const t=await token(),r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+path,{...opts,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json',...(opts.headers||{})}});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Google Sheets gagal');return j;
}
async function getRows(){
  const j=await sheets('/values/Promotions!A:Z');let rows=j.values||[];
  if(!rows.length)return [];
  if(String(rows[0][0]||'')!=='ID')return rows.map((r,i)=>mapRow(r,i+1)).filter(x=>x.id);
  return rows.slice(1).map((r,i)=>mapRow(r,i+2)).filter(x=>x.id);
}
function mapRow(r,row){
  return {id:String(r[0]||''),status:String(r[1]||'draft'),title:String(r[2]||''),description:String(r[3]||''),image:String(r[4]||''),link:String(r[5]||''),placement:String(r[6]||'home'),start:String(r[7]||''),end:String(r[8]||''),impressions:Number(r[9]||0),clicks:Number(r[10]||0),createdAt:String(r[11]||''),row};
}
function active(p){
  const now=Date.now(),s=p.start?Date.parse(p.start):NaN,e=p.end?Date.parse(p.end):NaN;
  return p.status==='active'&&(!Number.isFinite(s)||now>=s)&&(!Number.isFinite(e)||now<=e);
}
async function ensureSheet(){
  const meta=await sheets('');
  const exists=(meta.sheets||[]).some(s=>s.properties?.title==='Promotions');
  if(exists)return;
  await sheets(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:'Promotions'}}}]})});
  await sheets('/values/Promotions!A1:L1',{method:'PUT',body:JSON.stringify({range:'Promotions!A1:L1',majorDimension:'ROWS',values:[DEFAULT_HEADERS]})});
}
async function writeRow(row,values){
  return sheets('/values/Promotions!A'+row+':L'+row,{method:'PUT',body:JSON.stringify({range:'Promotions!A'+row+':L'+row,majorDimension:'ROWS',values:[values]})});
}
function clean(v,n=500){return String(v??'').trim().slice(0,n)}
module.exports=async(req,res)=>{
  try{
    const action=String(req.method==='GET'?(req.query?.action||'list'):(req.body?.action||'list'));
    if(action==='list'){
      await ensureSheet();const rows=await getRows();
      const out=rows.filter(active).map(({row,impressions,clicks,createdAt,...p})=>p);
      return res.status(200).json({ok:true,promotions:out});
    }
    auth(req);await ensureSheet();const rows=await getRows();
    if(action==='admin_list')return res.status(200).json({ok:true,promotions:rows});
    if(action==='save'){
      const b=req.body||{},id=clean(b.id,80)||crypto.randomUUID(),old=rows.find(x=>x.id===id);
      const values=[id,clean(b.status,20)||'draft',clean(b.title,120),clean(b.description,500),clean(b.image,1000),clean(b.link,1000),clean(b.placement,30)||'home',clean(b.start,40),clean(b.end,40),old?.impressions||0,old?.clicks||0,old?.createdAt||new Date().toISOString()];
      const row=old?.row||Math.max(2,rows.length+2);await writeRow(row,values);return res.status(200).json({ok:true,promotion:mapRow(values,row)});
    }
    if(action==='delete'){
      const id=clean(req.body?.id,80),p=rows.find(x=>x.id===id);if(!p)throw new Error('Promosi tidak ditemukan');
      await sheets('/values/Promotions!A'+p.row+':L'+p.row,{method:'PUT',body:JSON.stringify({range:'Promotions!A'+p.row+':L'+p.row,majorDimension:'ROWS',values:[['','','','','','','','','','','','']]})});
      return res.status(200).json({ok:true});
    }
    if(action==='track'){
      const id=clean(req.body?.id,80),type=req.body?.type==='click'?'click':'impression',p=rows.find(x=>x.id===id);
      if(!p)return res.status(404).json({ok:false,error:'Promosi tidak ditemukan'});
      const values=[p.id,p.status,p.title,p.description,p.image,p.link,p.placement,p.start,p.end,(p.impressions||0)+(type==='impression'?1:0),(p.clicks||0)+(type==='click'?1:0),p.createdAt];
      await writeRow(p.row,values);return res.status(200).json({ok:true});
    }
    throw new Error('Action tidak dikenali');
  }catch(e){return res.status(400).json({ok:false,error:e.message})}
};