// Test file for the flow in answer.js
temp_messages = [{
  role: 'assistant',
  content: 'You are a helpful assitant !!'
}]
async function callLLM(prompt, is_refine=false) {
  const token = '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';
  if(!is_refine) 
    temp_messages.push({
          role: 'user',
          content: prompt
        }
    )
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3-8b-instruct',
      messages: temp_messages,
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

async function mathTool(query) {
  const url = `https://api.mathjs.org/v4/?expr=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Math API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function newsTool(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`News API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function chemistryTool(query) {
  const url = `https://www.rhea-db.org/rhea/?query=${encodeURIComponent(query)}&columns=rhea-id,equation&format=tsv&limit=5`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Chemistry API error: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function processQuestion(input, tools_choosen) {
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
    tool_used: selectedTool,
    answer: finalAnswer.trim(),
  };
}

async function testFlow() {
  console.log('Testing the flow with sample questions...\n');

  const tools = ['math_tool', 'news_tool', 'chemistry_tool'];

  const questions = [
    'hello',
    'what is the sqrt of 4',
    'what\'s the weather like in hyderabad.',
    'What is the chemical definition of h2o'
  ];

  for (let q = 0; q < questions.length; q++){
    console.log("Question: " + questions[q])
    let answer = await callLLM(questions[q])
    console.log('Answer: ' + answer)
  }
}

testFlow();