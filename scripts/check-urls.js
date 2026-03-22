// Simple URL checker for external services used by the project.
// Usage: `node scripts/check-urls.js` (Node 18+ recommended)

const DEFAULT_TIMEOUT = 10000;

// Default GPT-OSS host used for checks (ZeroRegAI)
const DEFAULT_GPT_OSS = 'https://www.zeroregai.com/gpt-oss-20b';

const urls = [
  // GPT-OSS default URL (can be overridden via GPT_OSS_URL env var)
  { name: 'GPT_OSS (gpt-oss.me)', url: DEFAULT_GPT_OSS, method: 'GET' },
  { name: 'EaseMate Free Chat (general AI)', url: 'https://www.easemate.ai/chatgpt-free', method: 'GET' },
  { name: 'TalkAI (free chat)', url: 'https://talkai.info/', method: 'GET' },
  { name: 'TalkAI (free chat)', url: 'https://talkai.info/', method: 'GET' },
  // Image generation tools (free web UIs)
  { name: 'AI Image Generator', url: 'https://aiimagegenerator.online/', method: 'GET' },
  { name: 'Free Imgen', url: 'https://freeimgen.com/', method: 'GET' },
  { name: 'ImgCreatorAI', url: 'https://imgcreatorai.io/', method: 'GET' },
  { name: 'Upsampler', url: 'https://upsampler.com/free-image-generator-no-signup', method: 'GET' },
  { name: 'Vheer', url: 'https://vheer.com/', method: 'GET' },
  { name: 'MidGenAI', url: 'https://www.midgenai.com/text-to-image', method: 'GET' },
  { name: 'PixelDojo', url: 'https://pixeldojo.ai/free-ai-image-generator-no-signup', method: 'GET' },
  { name: 'Feedly (homepage)', url: 'https://feedly.com/', method: 'GET' },
  { name: 'Web-Capture (PDF)', url: 'https://web-capture.net/', method: 'GET' },
  { name: 'Web2ools (PDF/Word tools)', url: 'https://web2ools.com/', method: 'GET' },
  { name: 'MathJS', url: 'https://api.mathjs.org/v4/?expr=2%2B2', method: 'GET' },
  { name: 'Google News RSS', url: 'https://news.google.com/rss/search?q=test', method: 'GET' },
  { name: 'Rhea DB (chemistry)', url: 'https://www.rhea-db.org/rhea/?query=water&columns=rhea-id,equation&format=tsv&limit=1', method: 'GET' },
  { name: 'AskSia solver', url: 'https://www.asksia.ai/solver', method: 'GET' },
  { name: 'SmallPDF', url: 'https://smallpdf.com/', method: 'GET' },
  { name: 'Google Docs', url: 'https://docs.google.com/', method: 'GET' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/', method: 'GET' },
  // Local backend used in repo
//   { name: 'Local backend /answer', url: 'http://localhost:4000/answer', method: 'POST', body: { input: 'ping', tools_choosen: ['math_tool'] } }
];

// If GPT_OSS_URL env var is configured, add it to the test list
if (process.env.GPT_OSS_URL) {
  urls.unshift({ name: 'GPT_OSS (env GPT_OSS_URL)', url: process.env.GPT_OSS_URL, method: 'POST', body: { messages: [{ role: 'user', content: 'ping' }] } });
} else {
  // also test the default GPT_OSS GET endpoint
  urls.unshift({ name: 'GPT_OSS Default (gpt-oss.me)', url: DEFAULT_GPT_OSS, method: 'GET' });
}

async function run() {
  const results = [];
  for (const entry of urls) {
    const { name, url, method = 'GET', body } = entry;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    let ok = false;
    let status = null;
    let error = null;
    try {
      const opts = { method, signal: controller.signal, headers: {} };
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }

      // Prefer global fetch (Node 18+); otherwise attempt to dynamically import node-fetch
      let fetchFn = global.fetch;
      if (!fetchFn) {
        const nf = await import('node-fetch');
        fetchFn = nf.default || nf;
      }

      const res = await fetchFn(url, opts);
      status = res.status;
      ok = res.ok;
    } catch (err) {
      error = err.message || String(err);
    } finally {
      clearTimeout(timeout);
    }
    results.push({ name, url, method, status, ok, error });
    console.log(`${ok ? 'OK  ' : 'FAIL'} | ${name} | ${url} | status=${status || '-'} ${error ? '| error=' + error : ''}`);
  }

  const failed = results.filter(r => !r.ok);
  console.log('\nSummary:');
  console.log(`Total checked: ${results.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\nFailed endpoints:');
    failed.forEach(f => console.log(`- ${f.name} -> ${f.url} | status=${f.status || '-'} | error=${f.error || '-'}`));
    process.exitCode = 2;
  } else {
    console.log('All endpoints responded OK (2xx/3xx/OK).');
  }
}

run().catch(err => {
  console.error('Unexpected error running checks:', err);
  process.exit(1);
});
