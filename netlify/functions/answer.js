
// Netlify function for multi-tool chat bot
export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { messages, tools_choosen } = JSON.parse(event.body);

    // The messages array comes from frontend, add system if not present
    if (!messages.some(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: 'You are a helpful assistant that can use tools when appropriate.'
      });
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
      // Summarize the question before using the tool
      const summarizePrompt = `Based on the conversation, summarize the user's question into a single, concise query suitable for the ${selectedTool.replace('_', ' ')}.`;
      messages.push({ role: 'user', content: summarizePrompt });
      const summarizedQuery = await callLLM(messages);
      messages.push({ role: 'assistant', content: summarizedQuery });

      if (selectedTool === 'math_tool') {
        toolResult = await mathTool(summarizedQuery.trim());
      } else if (selectedTool === 'internet_search') {
        toolResult = await internetSearchTool(summarizedQuery.trim());
      } else if (selectedTool === 'reddit_tool') {
        toolResult = await redditTool(summarizedQuery.trim());
      } else if (selectedTool === 'chemistry_tool') {
        toolResult = await chemistryTool(summarizedQuery.trim());
      }

      // Check if tool result is good (not empty, not "No results", not "No relevant")
      if (toolResult && toolResult.trim() && !toolResult.includes('No results') && !toolResult.includes('No relevant')) {
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
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer: finalAnswer.trim(),
        }),
      };
    } else {
      // No tool or tool not good, answer directly
      const answerPrompt = `Answer the user's question directly: "${lastUserMessage}"`;
      messages.push({ role: 'assistant', content: selectedToolRaw });
      messages.push({ role: 'user', content: answerPrompt });
      finalAnswer = await callLLM(messages);
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer: finalAnswer.trim(),
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
}

/* ---------------- LLM (Decider + Refiner) ---------------- */

async function callLLM(messages) {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) {
    throw new Error('OpenRouter API key not configured');
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3-8b-instruct',
      messages: messages,
      // temperature: 0.7,
      // max_tokens: 1000,
    }),
  });

  // Optional safety check
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content; 
}
/* ---------------- Math Tool ---------------- */

async function mathTool(query) {
  const url = `https://newton.vercel.app/api/v2/simplify/${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Math API error: ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}


async function fetchRedditThread(permalink) {
  const url = `${permalink.replace(/\/+$/, "")}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "netlify-app" }
  });

  if (!res.ok) throw new Error("Reddit fetch failed");

  return await res.json();
}

async function internetSearchTool(query) {
  query = query.trim();
  // Add DuckDuckGo bangs for quick, targeted searches
  const queryLower = query.toLowerCase();
  if (queryLower.includes('wikipedia') || queryLower.includes('wiki')) {
    query = '!w ' + query;
  } else if (queryLower.includes('news')) {
    query = '!news ' + query;
  } else if (queryLower.includes('images') || queryLower.includes('pics')) {
    query = '!i ' + query;
  } else if (queryLower.includes('videos')) {
    query = '!v ' + query;
  }
  // Add more bangs as needed for other quick searches
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "multi-tool-chat-bot/1.0"
    }
  });

  if (!res.ok && res.status !== 202) {
    throw new Error(`DuckDuckGo search failed: ${res.status}`);
  }

  const data = await res.json();
  let result = '';

  if (data.AbstractText) {
    result += `Summary: ${data.AbstractText}\n`;
  }
  if (data.AbstractURL) {
    result += `Source: ${data.AbstractURL}\n`;
  }
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    result += '\nRelated Topics:\n';
    data.RelatedTopics.slice(0, 5).forEach(topic => {
      if (topic.Text) {
        result += `- ${topic.Text}\n`;
      }
    });
  }

  return result || 'No results found.';
}

async function chemistryTool(query) {
  const url = `https://commonchemistry.cas.org/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Chemistry API error: ${res.status}`);
  }
  const data = await res.json();
  return data.results ? data.results.slice(0, 5) : [];
}

async function searchSubreddit(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=100`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" },
  });

  if (!res.ok) throw new Error("Reddit search failed");

  const json = await res.json();
  return json.data.children.map(p => ({
    title: p.data.title,
    url: `https://reddit.com${p.data.permalink}`,
    score: p.data.score,
    created: p.data.created_utc,
    subreddit: p.data.subreddit,
    author: p.data.author
  }));
}


async function selectSubreddits(query) {
  // Preprocess query for subreddit search: remove stop words and take key terms
  const stopWords = new Set(['get', 'me', 'the', 'latest', 'in', 'a', 'an', 'and', 'or', 'but', 'if', 'while', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
  const keyTerms = query.toLowerCase().split(' ').filter(word => !stopWords.has(word));
  const subredditQuery = keyTerms.slice(0, 5).join(' ');
  const url = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(subredditQuery)}&limit=10`;
  const res = await fetch(url, {
    headers: { "User-Agent": "multi-tool-chat-bot/1.0" }
  });
  if (!res.ok) return [];
  try {
    const data = await res.json();
    const children = data.data.children;
    const subs = children
      .filter(child => child.kind === 't5' && child.data && child.data.subscribers >= 10000 && !child.data.over18)
      .map(child => child.data.display_name)
      .slice(0, 3);
    // Now search in these subs
    const allPosts = [];
    for (const sub of subs) {
      try {
        const posts = await searchSubreddit(sub, query);
        allPosts.push(...posts);
      } catch (e) {}
    }
    // Sort by score and take top 5
    const topPosts = allPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    // Fetch details and summarize
    const summaries = [];
    for (const post of topPosts) {
      try {
        const threadData = await fetchRedditThread(post.url);
        if (!Array.isArray(threadData) || threadData.length < 2) continue;
        const postData = threadData[0].data.children[0].data;
        const comments = threadData[1].data.children.slice(0, 5).map(c => c.data && c.data.body ? c.data.body : '').join(' ').substring(0, 500);
        const content = `${postData.title} ${postData.selftext || ''} ${comments}`;
        // Summarize relevant to query
        const summaryPrompt = `Summarize the parts of this Reddit post and comments that are relevant to the query '${query}'. If nothing is relevant, say 'Not relevant'. Keep it concise: ${content}`;
        const summary = await callLLM([{ role: 'user', content: summaryPrompt }]);
        if (summary.trim() !== 'Not relevant') {
          summaries.push(`Post: ${post.title} - ${summary.trim()}`);
        }
      } catch (e) {}
    }
    return summaries.length > 0 ? summaries.join('\n\n') : 'No relevant posts found.';
  } catch (e) {
    return 'No relevant posts found.';
  }
}

async function redditTool(query) {
  return await selectSubreddits(query);
}

