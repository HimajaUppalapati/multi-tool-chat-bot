(async () => {
  try {
    const url = process.env.GPT_OSS_URL || 'https://www.zeroregai.com/gpt-oss-20b';
    console.log('Probing URL:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] })
    });
    console.log('POST status:', res.status, res.statusText);
    const txt = await res.text().catch(() => '<no body>');
    console.log('POST body:', txt.slice(0, 200));
  } catch (err) {
    console.error('POST error:', err && err.message ? err.message : err);
  }
})();
