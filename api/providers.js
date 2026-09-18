const DEFAULT_PROVIDERS = [
  {
    id: 'vidsrc',
    name: 'Vidsrc',
    enabled: true,
    movieTemplate: 'https://vidsrc.sh/embed/movie/{id}',
    tvTemplate: 'https://vidsrc.sh/embed/tv/{id}/{season}/{episode}'
  },
  {
    id: 'pustaka',
    name: 'Server 2',
    enabled: true,
    url: 'https://paceboook21.blogspot.com/p/video-preview-body-margin-0-padding-0_0619822090.html'
  },
  {
    id: 'live',
    name: 'Server 3',
    enabled: true,
    url: 'https://paceboook21.blogspot.com/p/live-hot-box-sizing-border-box-margin-0.html'
  }
];

function getProviders() {
  const raw = process.env.NOVA_PROVIDERS_JSON;
  if (!raw) return DEFAULT_PROVIDERS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('NOVA_PROVIDERS_JSON harus berupa array');
    return parsed.filter(p => p && p.enabled !== false && p.name && (p.url || p.movieTemplate || p.tvTemplate));
  } catch (e) {
    console.warn('NOVA_PROVIDERS_JSON tidak valid, menggunakan provider bawaan:', e.message);
    return DEFAULT_PROVIDERS;
  }
}

function isSafeHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizeProvider(p) {
  const out = {
    id: String(p.id || p.name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    name: String(p.name).slice(0, 80)
  };
  if (p.url && isSafeHttpUrl(p.url)) out.url = p.url;
  if (p.movieTemplate && /^https?:\/\//i.test(p.movieTemplate)) out.movieTemplate = p.movieTemplate;
  if (p.tvTemplate && /^https?:\/\//i.test(p.tvTemplate)) out.tvTemplate = p.tvTemplate;
  return out;
}

module.exports = async function(req, res) {
  const expected=process.env.NOVA_ADMIN_KEY;
  if(!expected || req.headers['x-nova-key']!==expected) return res.status(401).json({error:'Admin key salah atau belum diisi'});
  if (req.method === 'POST') {
    try {
      const url=String(req.body?.url||'').trim();
      if(!isSafeHttpUrl(url)) return res.status(400).json({error:'URL provider tidak valid'});
      const started=Date.now();
      const r=await fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(10000)});
      return res.status(200).json({ok:true,status:r.status,reachable:r.ok,ms:Date.now()-started,finalUrl:r.url});
    } catch(e) {
      return res.status(200).json({ok:true,status:0,reachable:false,ms:null,error:e.message});
    }
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const providers = getProviders().map(sanitizeProvider).filter(p => p.url || p.movieTemplate || p.tvTemplate);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ ok: true, providers, source: process.env.NOVA_PROVIDERS_JSON ? 'env' : 'default' });
};
