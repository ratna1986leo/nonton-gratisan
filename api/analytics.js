const SUPABASE_URL = 'https://pxybcjmrkenkzmaavuxm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_P4xAbhb76YJcuhSMrUSXkg_IZYNFWdW';

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const sessionId = clean(body.session_id, 80);
    const path = clean(body.path || '/', 500);

    if (sessionId.length < 16 || path.length < 1) {
      return res.status(400).json({ error: 'Invalid analytics payload' });
    }

    const payload = {
      session_id: sessionId,
      path,
      page_title: clean(body.page_title, 300),
      media_type: clean(body.media_type, 20),
      media_id: clean(body.media_id, 80),
      referrer: clean(body.referrer, 500),
      device_type: clean(body.device_type, 30),
      browser: clean(body.browser, 80),
      country: clean(req.headers['x-vercel-ip-country'] || '', 80),
      city: clean(req.headers['x-vercel-ip-city'] || '', 120),
      user_agent: clean(req.headers['user-agent'] || '', 500)
    };

    const r = await fetch(SUPABASE_URL + '/rest/v1/visitor_events', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('analytics insert failed', r.status, detail);
      return res.status(502).json({ error: 'Analytics storage unavailable' });
    }

    return res.status(204).end();
  } catch (error) {
    console.error('analytics collector error', error);
    return res.status(500).json({ error: 'Analytics collector failed' });
  }
}
