export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { input, tools_choosen } = JSON.parse(event.body);

    const decidePrompt = `Given the user question: "${input}"
Available tools: ${tools_choosen.join(', ')}
Decide which tool to use. If none needed, say "none". Otherwise, choose one from the list. Respond only with the tool name or "none".`;

    const selectedToolRaw = await callLLM(decidePrompt);
    const selectedTool = (typeof selectedToolRaw === 'string' ? selectedToolRaw : String(selectedToolRaw)).trim();

    let finalAnswer = '';

    if (selectedTool === 'none') {
      finalAnswer = await callLLM(`Respond casually to: "${input}"`);
    } else {
      let toolResult = '';
      if (selectedTool === 'math_tool') {
        toolResult = await mathTool(input);
      } else if (selectedTool === 'news_tool') {
        toolResult = await newsTool(input);
      } else if (selectedTool === 'chemistry_tool') {
        toolResult = await chemistryTool(input);
      } else {
        finalAnswer = 'Unknown tool selected';
      }

      if (toolResult) {
        const refinePrompt = `User asked: "${input}"
Tool used: ${selectedTool}
Tool output:
${toolResult}

Give a clear final answer:`;
        finalAnswer = await callLLM(refinePrompt);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        tool_used: selectedTool,
        answer: finalAnswer.trim(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
}

/* ---------------- LLM (Decider + Refiner) ---------------- */

async function callLLM(prompt) {
  const res = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    throw new Error(`LLM API error: ${res.status} ${res.statusText}`);
  }
  const response = await res.text();
  try {
    const json = JSON.parse(response);
    return json.text || json.response || json.content || response;
  } catch {
    return response;
  }
}

/* ---------------- Math Tool ---------------- */

async function mathTool(query) {
  const url = `https://api.mathjs.org/v4/?expr=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Math API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/* ---------------- News Tool ---------------- */

async function newsTool(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`News API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/* ---------------- Chemistry Tool ---------------- */

async function chemistryTool(query) {
  const url = `https://www.rhea-db.org/rhea/?query=${encodeURIComponent(query)}&columns=rhea-id,equation&format=tsv&limit=5`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Chemistry API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/* ---------------- Tool Selector ---------------- */

