const DEFAULT_CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vTdLZAQVdfGSSB2qO076v43C7Gxwe0WWLYG46pELaAYgOeM30fGPQWFJBHdla_FSmN4ki_v3yqG3OvN/pub?output=csv';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const source=String(process.env.GOOGLE_SHEETS_CSV_URL||DEFAULT_CSV).trim();
    const r=await fetch(source,{cache:'no-store'});
    const body=await r.text();
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    return res.status(r.status).send(body);
  }catch(e){
    return res.status(502).json({error:e.message||'Catalog proxy gagal'});
  }
}
