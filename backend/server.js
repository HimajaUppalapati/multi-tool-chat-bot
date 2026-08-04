import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// CORS middleware for local dev frontend (adjust origin if needed)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  // res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Allow preflight
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/*
  This server mirrors the Netlify function at netlify/functions/answer.js
  It accepts POST /answer with body { messages, tools_choosen }
  and returns JSON { answer: string }
*/

/* ---------------- LLM (OpenRouter) ---------------- */
async function callLLM(messages) {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) throw new Error('OpenRouter API key not configured');

  // Array of alternative free models to try if Llama 3.3 fails
  const FREE_MODEL_POOL = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.5-flash:free',
    'deepseek/deepseek-chat:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'openrouter/auto' // The 'auto' router dynamically picks an available free model
  ];

  async function fetchWithFallback(messages, token) {
    // Loop through each model in the fallback pool
    for (const model of FREE_MODEL_POOL) {
      try {
        console.log(`Attempting request with model: ${model}`);
        
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            // Optional OpenRouter headers to help identify your app traffic
            'HTTP-Referer': 'https://localhost:3000', 
            'X-Title': 'My App',
          },
          body: JSON.stringify({
            model: model,
            messages,
          }),
        });

        // If rate limited (429) or overloaded (503), move to the next model
        if (res.status === 429 || res.status === 503) {
          console.warn(`Model ${model} rate limited or unavailable (${res.status}). Trying next fallback...`);
          continue; 
        }

        // If the response is not ok for other reasons, throw an error
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP error! status: ${res.status}`);
        }

        // Success! Return the successful response
        return await res.json();

      } catch (error) {
        console.error(`Error with model ${model}:`, error.message);
        // If we are at the end of the pool, rethrow the error
        if (model === FREE_MODEL_POOL[FREE_MODEL_POOL.length - 1]) {
          throw new Error("All fallback free models failed.");
        }
      }
    }
  }

  const data = await fetchWithFallback(messages, token);

  // Normalize various possible response shapes to a plain string.
  // OpenRouter typically returns { choices: [{ message: { content: '...' } }, ...] }
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    // some providers return output arrays
    data?.output?.[0]?.content?.[0]?.text ||
    data?.output?.[0]?.text ||
    // fallback fields
    data?.result ||
    data?.text ||
    // last resort: stringify the whole response
    (typeof data === 'string' ? data : JSON.stringify(data));

  return content;
}

/* ---------------- Math Tool ---------------- */
async function mathTool(query) {
  const url = `https://newton.vercel.app/api/v2/simplify/${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Math API error: ${res.status}`);
  const data = await res.json();
  return data.result;
}

/* ---------------- Internet Search (DuckDuckGo) ---------------- */
async function internetSearchTool(query) {
  query = query.trim();
  const qLower = query.toLowerCase();
  if (qLower.includes('wikipedia') || qLower.includes('wiki')) query = '!w ' + query;
  else if (qLower.includes('news')) query = '!news ' + query;
  else if (qLower.includes('images') || qLower.includes('pics')) query = '!i ' + query;
  else if (qLower.includes('videos')) query = '!v ' + query;

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'multi-tool-chat-bot/1.0' } });
  if (!res.ok && res.status !== 202) throw new Error(`DuckDuckGo search failed: ${res.status}`);
  const data = await res.json();

  let result = '';
  if (data.AbstractText) result += `Summary: ${data.AbstractText}\n`;
  if (data.AbstractURL) result += `Source: ${data.AbstractURL}\n`;
  if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length) {
    result += '\nRelated Topics:\n';
    data.RelatedTopics.slice(0,5).forEach(topic => { if (topic.Text) result += `- ${topic.Text}\n`; });
  }
  return result || 'No results found.';
}

/* ---------------- Chemistry Tool ---------------- */
async function chemistryTool(query) {
  const url = `https://commonchemistry.cas.org/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Chemistry API error: ${res.status}`);
  const data = await res.json();
  return data.results ? data.results.slice(0,5) : [];
}

/* ---------------- Reddit Helpers ---------------- */
async function fetchRedditThread(permalink) {
  const url = `${permalink.replace(/\/+$/, '')}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'netlify-app' } });
  if (!res.ok) throw new Error('Reddit fetch failed');
  return await res.json();
}

async function searchSubreddit(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=100`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('Reddit search failed');
  const json = await res.json();
  return json.data.children.map(p => ({ title: p.data.title, url: `https://reddit.com${p.data.permalink}`, score: p.data.score, created: p.data.created_utc, subreddit: p.data.subreddit, author: p.data.author }));
}

async function selectSubreddits(query) {
  const stopWords = new Set(['get','me','the','latest','in','a','an','and','or','but','if','while','at','by','for','with','about','against','between','into','through','during','before','after','above','below','to','from','up','down','in','out','on','off','over','under','again','further','then','once']);
  const keyTerms = query.toLowerCase().split(' ').filter(w => !stopWords.has(w));
  const subredditQuery = keyTerms.slice(0,5).join(' ');
  const url = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(subredditQuery)}&limit=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'multi-tool-chat-bot/1.0' } });
  if (!res.ok) return [];
  try {
    const data = await res.json();
    const children = data.data.children;
    const subs = children.filter(child => child.kind === 't5' && child.data && child.data.subscribers >= 10000 && !child.data.over18).map(c => c.data.display_name).slice(0,3);
    const allPosts = [];
    for (const sub of subs) {
      try { const posts = await searchSubreddit(sub, query); allPosts.push(...posts); } catch (e) {}
    }
    const topPosts = allPosts.sort((a,b) => b.score - a.score).slice(0,5);
    const summaries = [];
    for (const post of topPosts) {
      try {
        const threadData = await fetchRedditThread(post.url);
        if (!Array.isArray(threadData) || threadData.length < 2) continue;
        const postData = threadData[0].data.children[0].data;
        const comments = threadData[1].data.children.slice(0,5).map(c => c.data && c.data.body ? c.data.body : '').join(' ').substring(0,500);
        const content = `${postData.title} ${postData.selftext || ''} ${comments}`;
        const summaryPrompt = `Summarize the parts of this Reddit post and comments that are relevant to the query '${query}'. If nothing is relevant, say 'Not relevant'. Keep it concise: ${content}`;
        const summary = await callLLM([{ role: 'user', content: summaryPrompt }]);
        if (summary.trim() !== 'Not relevant') summaries.push(`Post: ${post.title} - ${summary.trim()}`);
      } catch (e) {}
    }
    return summaries.length > 0 ? summaries.join('\n\n') : 'No relevant posts found.';
  } catch (e) {
    return 'No relevant posts found.';
  }
}

async function redditTool(query) { return await selectSubreddits(query); }

/* ---------------- Main Route (/answer) ---------------- */
app.post('/answer', async (req, res) => {
  try {
    const { messages = [], tools_choosen = [] } = req.body;

    // Ensure system message
    if (!messages.some(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: 'You are a helpful assistant that can use tools when appropriate.' });
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

    const decidePrompt = `Given the user question: "${lastUserMessage}"
Available tools: ${tools_choosen.join(', ')}
Decide which tool to use. If none needed, say "none". Otherwise, choose one from the list. Respond only with the tool name or "none".`;

    messages.push({ role: 'user', content: decidePrompt });
    const selectedToolRaw = await callLLM(messages);
    const selectedTool = selectedToolRaw.trim();

    let finalAnswer = '';
    let toolResult = null;
    let useTool = false;

    if (selectedTool !== 'none' && tools_choosen.includes(selectedTool)) {
      const summarizePrompt = `Based on the conversation, summarize the user's question into a single, concise query suitable for the ${selectedTool.replace('_',' ')}.`;
      messages.push({ role: 'user', content: summarizePrompt });
      const summarizedQuery = await callLLM(messages);
      messages.push({ role: 'assistant', content: summarizedQuery });

      if (selectedTool === 'math_tool') toolResult = await mathTool(summarizedQuery.trim());
      else if (selectedTool === 'internet_search') toolResult = await internetSearchTool(summarizedQuery.trim());
      else if (selectedTool === 'reddit_tool') toolResult = await redditTool(summarizedQuery.trim());
      else if (selectedTool === 'chemistry_tool') toolResult = await chemistryTool(summarizedQuery.trim());

      if (toolResult && (typeof toolResult === 'string' ? toolResult.trim() : true) && !(typeof toolResult === 'string' && (toolResult.includes('No results') || toolResult.includes('No relevant')))) {
        useTool = true;
      }
    }

    if (useTool) {
      const refinePrompt = `User asked: "${lastUserMessage}"
Tool output:
${toolResult}

Give a clear final answer based on the tool output.`;
      messages.push({ role: 'assistant', content: selectedToolRaw });
      messages.push({ role: 'user', content: refinePrompt });
      finalAnswer = await callLLM(messages);
      return res.json({ answer: finalAnswer.trim() });
    } else {
      const answerPrompt = `Answer the user's question directly: "${lastUserMessage}"`;
      messages.push({ role: 'assistant', content: selectedToolRaw });
      messages.push({ role: 'user', content: answerPrompt });
      finalAnswer = await callLLM(messages);
      return res.json({ answer: finalAnswer.trim() });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
