export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { input, tools_choosen, conversation_history } = JSON.parse(event.body);

    // Build context from conversation history
    let contextString = '';
    if (conversation_history && conversation_history.length > 0) {
      contextString = '\nPrevious conversation:\n';
      conversation_history.slice(-6).forEach((msg) => {
        contextString += `${msg.sender}: ${msg.text}\n`;
      });
    }

    const decidePrompt = `${contextString}
Given the user question: "${input}"
Available tools: ${tools_choosen.join(', ')}
Decide which tool to use. If none needed, say "none". Otherwise, choose one from the list. Respond only with the tool name or "none".`;

    const selectedToolRaw = await callLLM(decidePrompt);
    const selectedTool = (typeof selectedToolRaw === 'string' ? selectedToolRaw : String(selectedToolRaw)).trim();

    let finalAnswer = '';

    // Domain groups: each domain lists tools in order of fallback priority
    const domainGroups = {
      chat_ai: ['gpt_oss', 'easemate', 'talkai'],
      image_generation: ['aiimagegenerator','freeimgen','imgcreatorai','upsampler','vheer','midgenai','pixeldojo'],
      documents: ['web2ools','smallpdf','google_docs','web_capture'],
      search_news: ['duckduckgo','web_search_tool','feedly'],
      science: ['physics_tool','chemistry_tool','biology_tool','math_tool']
    };

    // Flatten supported tools from groups + standalone tools
    const supportedTools = new Set([
      'math_tool','news_tool','chemistry_tool','physics_tool','biology_tool','web_search_tool','medical_info_tool',
      'gpt_oss','easemate','talkai','feedly','web_capture','web2ools','smallpdf','google_docs','duckduckgo',
      'aiimagegenerator','freeimgen','imgcreatorai','upsampler','vheer','midgenai','pixeldojo'
    ]);

    // Determine the candidate tool sequence to try: if the Ochestrator returned a domain name, use its group.
    let candidateTools = [];
    if (domainGroups[selectedTool]) {
      candidateTools = domainGroups[selectedTool];
    } else if (supportedTools.has(selectedTool)) {
      candidateTools = [selectedTool];
    } else {
      candidateTools = ['none'];
    }

    if (candidateTools.length === 0 || candidateTools[0] === 'none') {
      finalAnswer = await callLLM(`${contextString}
Respond casually to: "${input}"`);
    } else {
      let toolResult = '';
      // try each tool in candidateTools in order until one succeeds
      for (const t of candidateTools) {
        try {
          if (t === 'math_tool') {
        toolResult = await mathTool(input);
          } else if (t === 'news_tool') {
        toolResult = await newsTool(input);
          } else if (t === 'chemistry_tool') {
        toolResult = await chemistryTool(input);
          } else if (t === 'physics_tool') {
        toolResult = await physicsTool(input);
          } else if (t === 'biology_tool') {
        toolResult = await biologyTool(input);
          } else if (t === 'web_search_tool') {
        toolResult = await webSearchTool(input);
          } else if (t === 'medical_info_tool') {
        toolResult = await medicalInfoTool(input);
          } else if (t === 'gpt_oss') {
            toolResult = await callGPTOSS(input);
          } else if (t === 'easemate') {
            toolResult = await easeMateTool(input);
          } else if (t === 'talkai') {
            toolResult = await talkAITool(input);
          } else if (t === 'feedly') {
            toolResult = await feedlyTool(input);
          } else if (t === 'web_capture') {
            toolResult = await webCaptureTool(input);
          } else if (t === 'web2ools') {
            toolResult = await web2oolsTool(input);
          } else if (t === 'smallpdf') {
            toolResult = await smallPdfTool(input);
          } else if (t === 'google_docs') {
            toolResult = await googleDocsTool(input);
          } else if (t === 'duckduckgo') {
            toolResult = await duckDuckGoTool(input);
          } else if (t === 'aiimagegenerator') {
            toolResult = await aiImageGeneratorTool(input);
          } else if (t === 'freeimgen') {
            toolResult = await freeImGenTool(input);
          } else if (t === 'imgcreatorai') {
            toolResult = await imgCreatorAiTool(input);
          } else if (t === 'upsampler') {
            toolResult = await upsamplerTool(input);
          } else if (t === 'vheer') {
            toolResult = await vheerTool(input);
          } else if (t === 'midgenai') {
            toolResult = await midgenaiTool(input);
          } else if (t === 'pixeldojo') {
            toolResult = await pixelDojoTool(input);
          }

          // if we got a non-error result, stop trying fallbacks
          if (typeof toolResult === 'string' && !/error/i.test(toolResult) && toolResult.trim().length > 0) {
            // mark selectedTool as the successful tool
            toolToUse = t;
            break;
          }
        } catch (err) {
          // try next tool in the group
          toolResult = `error: ${err.message || err}`;
        }
      }

      if (toolResult) {
        // If the tool returned an error-like message, fall back to the general LLM
        if (typeof toolResult === 'string' && /error/i.test(toolResult)) {
          const fallbackPrompt = `${contextString}
Tool ${selectedTool} failed with message: ${toolResult}
Ignore the tool and provide a helpful answer to: "${input}"`;
          finalAnswer = await callLLM(fallbackPrompt);
        } else {
          const refinePrompt = `${contextString}
User asked: "${input}"
Tool used: ${selectedTool}
Tool output:
${toolResult}

Give a clear final answer:`;
          finalAnswer = await callLLM(refinePrompt);
        }
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

// Default GPT-OSS host (can be overridden via GPT_OSS_URL env var)
const DEFAULT_GPT_OSS_URL = 'https://www.zeroregai.com/gpt-oss-20b';

// Public, free GPT-OSS chat UIs (browser chat pages). These are not API
// endpoints but they are useful links to recommend to users when an API is
// unavailable. The app will suggest these as fallbacks.
const GPT_OSS_FALLBACK_CHATS = [
  { name: 'ZeroRegAI — GPT-OSS 20B', url: 'https://www.zeroregai.com/gpt-oss-20b' },
  { name: 'GPT-OSS.me', url: 'https://gpt-oss.me/' },
  { name: 'Free LLM Playground', url: 'https://freellmplayground.com/' },
  { name: 'Chat LLM', url: 'https://chats-llm.com/' },
  { name: 'LLMChat.me', url: 'https://llmchat.me/' }
];

async function callLLM(prompt) {
  // Only attempt to call an external GPT-OSS API when the user explicitly
  // configures `GPT_OSS_URL`. The repo-default `DEFAULT_GPT_OSS_URL` points
  // at a public web UI which does not accept POST requests and returns 405.
  // To avoid noisy errors and falling back too often, prefer the local
  // fallback unless an explicit API URL is provided.
  if (process.env.GPT_OSS_URL) {
    try {
      return await callGPTOSS(prompt);
    } catch (err) {
      console.warn('gpt-oss call failed, using local fallback:', err.message || err);
      return localFallbackLLM(prompt, { includeFallbackLinks: true });
    }
  }

  console.warn('GPT_OSS_URL not configured; using local fallback LLM. Set GPT_OSS_URL to a POST-capable API endpoint to enable external LLM calls.');
  return localFallbackLLM(prompt, { includeFallbackLinks: true });
}

async function localFallbackLLM(prompt, opts = {}) {
  // Very small heuristic-based fallback (async):
  // - If prompt asks to choose a tool, return 'none'
  // - If math-like query (e.g., "sqrt of 10"), try `mathTool`
  // - Otherwise, return a concise friendly reply or extract tool output
  try {
    const lower = prompt.toLowerCase();
    if (lower.includes('decide which tool to use') || lower.includes('respond with exactly one word') || lower.includes('available tools')) {
      return 'none';
    }

    // Basic math detection: handle sqrt and square root queries by calling mathTool
    const sqrtMatch = prompt.match(/sqrt(?:\s+of)?\s*[:\"]?\s*([0-9\.\-eE]+)/i) || prompt.match(/square root of\s*[:\"]?\s*([0-9\.\-eE]+)/i);
    if (sqrtMatch) {
      const num = sqrtMatch[1];
      try {
        const expr = `sqrt(${num})`;
        const res = await mathTool(expr);
        return res;
      } catch (e) {
        // fall through to other heuristics
      }
    }

    // If asked to 'Respond casually to: "..."' return a natural casual reply
    const casualMatch = prompt.match(/Respond casually to:\s*"([\s\S]*?)"/i);
    if (casualMatch) {
      const userText = casualMatch[1].trim();
      const g = userText.toLowerCase();
      if (/^(hello|hi|hey|hi there|hello there)\b/.test(g)) {
        return "Hello! I'm your AI assistant. How can I help you today?";
      }
      // Default casual reply: return the user's question or statement plainly (no added prefix).
      return userText;
    }

    // If prompt includes a tool output / refine request, try to extract the tool output and return it as final answer
    const toolOutputMatch = prompt.match(/Tool output:\s*([\s\S]*?)\n\nGive a clear final answer:/i);
    if (toolOutputMatch) {
      const out = toolOutputMatch[1].trim();
      if (out) return out;
    }

    // Otherwise extract the user's question and return it plainly as a short reply
    const match = prompt.match(/Given the user question:\s*"([\s\S]*?)"/i) || prompt.match(/User asked:\s*"([\s\S]*?)"/i);
    const question = match ? match[1].trim() : prompt.slice(0, 200);

    let reply = question;

    // If the caller requested fallback chat links, append them as suggestions.
    if (opts.includeFallbackLinks) {
      reply += '\n\nIf you want to try a free browser-hosted GPT-OSS chat (no API key), try one of these:';
      GPT_OSS_FALLBACK_CHATS.forEach(c => {
        reply += `\n- ${c.name}: ${c.url}`;
      });
      reply += '\n\nThese are browser chat UIs (not programmatic APIs); open one in your browser to chat with the model directly.';
    }

    return reply;
  } catch (e) {
    return "I'm sorry — I couldn't process that right now.";
  }
}

async function callGPTOSS(prompt) {
  const url = process.env.GPT_OSS_URL || DEFAULT_GPT_OSS_URL;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.GPT_OSS_API_KEY) headers['Authorization'] = `Bearer ${process.env.GPT_OSS_API_KEY}`;

  // Prepare a POST body compatible with typical GPT-OSS endpoints
  const postBody = JSON.stringify({ messages: [{ role: 'user', content: prompt }] });

  // Try POST first. If we receive a 405 (Method Not Allowed), some public
  // web UIs do not accept POST — attempt a GET probe as a graceful fallback.
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: postBody });
  } catch (err) {
    throw new Error(`gpt-oss network error: ${err.message || err}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // If the endpoint rejects POSTs (405), try a simple GET probe.
    if (res.status === 405) {
      try {
        const probe = await fetch(url, { method: 'GET', headers });
        const probeText = await probe.text().catch(() => '');
        if (probe.ok) {
          try {
            const json = JSON.parse(probeText);
            return json.text || json.response || json.content || probeText;
          } catch {
            return probeText;
          }
        }
        // If GET also fails, surface the original POST error for diagnostics
        throw new Error(`gpt-oss API error: ${res.status} ${res.statusText} ${txt}`);
      } catch (e) {
        throw new Error(`gpt-oss API error: ${res.status} ${res.statusText} ${txt}`);
      }
    }
    throw new Error(`gpt-oss API error: ${res.status} ${res.statusText} ${txt}`);
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json.text || json.response || json.content || text;
  } catch {
    return text;
  }
}

/* ---------------- Simple web-UI tool helpers ---------------- */

async function easeMateTool(query) {
  try {
    const prompt = `The user asked: "${query}"\n\nProvide a concise helpful answer to the user's question and then give step-by-step guidance for how to use the EaseMate web chat (https://www.easemate.ai/chatgpt-free) to reproduce or refine this answer. Make the guidance actionable (what to paste, which settings to try, and follow-up questions).`;
    return await callLLM(prompt);
  } catch (err) {
    return `EaseMate helper error: ${err.message || err}`;
  }
}

async function talkAITool(query) {
  try {
    const prompt = `The user asked: "${query}"\n\nProvide a concise helpful answer to the user's question and then give step-by-step guidance for how to use the TalkAI web chat (https://talkai.info/) to reproduce or refine this answer. Include example prompts to paste and follow-ups.`;
    return await callLLM(prompt);
  } catch (err) {
    return `TalkAI helper error: ${err.message || err}`;
  }
}

async function feedlyTool(query) {
  try {
    const prompt = `The user wants news or recent information about: "${query}".\n\nReturn a short summary of how to find up-to-date coverage using RSS/readers and then provide a concise summary of likely relevant headlines or angles the user should search for. Also include exact RSS feed URLs (examples) and search keywords to paste into Feedly (https://feedly.com/).`;
    return await callLLM(prompt);
  } catch (err) {
    return `Feedly helper error: ${err.message || err}`;
  }
}

async function webCaptureTool(query) {
  try {
    const prompt = `The user asked to capture or convert content related to: "${query}" into a PDF.\n\nProvide a concise step-by-step instruction for using Web-Capture (https://web-capture.net/) to convert a webpage or content into a clean PDF. Then generate a short summary answer to the user's original question.`;
    return await callLLM(prompt);
  } catch (err) {
    return `Web-Capture helper error: ${err.message || err}`;
  }
}

async function web2oolsTool(query) {
  try {
    const prompt = `The user needs to convert or edit documents related to: "${query}".\n\nProvide a concise answer to the user's question and then step-by-step instructions to use Web2ools (https://web2ools.com/) for common tasks (text→doc, doc→pdf, basic formatting). Include example settings or options.`;
    return await callLLM(prompt);
  } catch (err) {
    return `Web2ools helper error: ${err.message || err}`;
  }
}

async function smallPdfTool(query) {
  try {
    const prompt = `The user asked about PDF operations for: "${query}".\n\nProvide a concise helpful answer and then describe step-by-step how to use SmallPDF (https://smallpdf.com/) to accomplish tasks like convert, merge, split, compress. Include which menu items or options to use.`;
    return await callLLM(prompt);
  } catch (err) {
    return `SmallPDF helper error: ${err.message || err}`;
  }
}

async function googleDocsTool(query) {
  try {
    const prompt = `The user asked: "${query}".\n\nProvide a concise answer and then step-by-step guidance for using Google Docs (https://docs.google.com/) to create, format, and export a document (to .docx or PDF). Include suggested formatting steps and export instructions.`;
    return await callLLM(prompt);
  } catch (err) {
    return `Google Docs helper error: ${err.message || err}`;
  }
}

async function duckDuckGoTool(query) {
  try {
    const prompt = `The user wants a quick, reliable summary for search query: "${query}".\n\nFirst, provide a concise answer or summary to the user's question as if you had current web access. Next, include a recommended DuckDuckGo search URL (https://duckduckgo.com/?q=...) and suggested search refinements the user can paste to get better results.`;
    return await callLLM(prompt);
  } catch (err) {
    return `DuckDuckGo helper error: ${err.message || err}`;
  }
}

/* ---------------- Image Generation Helpers ---------------- */

async function aiImageGeneratorTool(promptText) {
  try {
    const prompt = `User prompt for image generation: "${promptText}"\n\nProvide a short example prompt optimized for text-to-image generation, include suggested style/seed/parameters and then give a short guidance on how to use https://aiimagegenerator.online/ (what to paste, quality settings, and download tips).`;
    return await callLLM(prompt);
  } catch (err) {
    return `AI Image Generator helper error: ${err.message || err}`;
  }
}

async function freeImGenTool(promptText) {
  try {
    const prompt = `User prompt for image generation: "${promptText}"\n\nProvide an optimized prompt and usage tips for freeimgen.com (how to paste, resolution choices, and downloading).`;
    return await callLLM(prompt);
  } catch (err) {
    return `FreeImGen helper error: ${err.message || err}`;
  }
}

async function imgCreatorAiTool(promptText) {
  try {
    const prompt = `User prompt for image generation: "${promptText}"\n\nGive an example generation prompt, recommended mode (if applicable), and step-by-step instructions for using https://imgcreatorai.io/.`;
    return await callLLM(prompt);
  } catch (err) {
    return `ImgCreatorAI helper error: ${err.message || err}`;
  }
}

async function upsamplerTool(promptText) {
  try {
    const prompt = `User wants image generation or upscaling for: "${promptText}"\n\nProvide instructions for generating or upscaling via https://upsampler.com/free-image-generator-no-signup and best settings, plus an example prompt.`;
    return await callLLM(prompt);
  } catch (err) {
    return `Upsampler helper error: ${err.message || err}`;
  }
}

async function vheerTool(promptText) {
  try {
    const prompt = `User prompt: "${promptText}"\n\nProvide a suggested prompt and usage guidance for Vheer (https://vheer.com/) including available edit features.`;
    return await callLLM(prompt);
  } catch (err) {
    return `Vheer helper error: ${err.message || err}`;
  }
}

async function midgenaiTool(promptText) {
  try {
    const prompt = `User prompt: "${promptText}"\n\nProvide a short optimized prompt and how-to for https://www.midgenai.com/text-to-image usage.`;
    return await callLLM(prompt);
  } catch (err) {
    return `MidGenAI helper error: ${err.message || err}`;
  }
}

async function pixelDojoTool(promptText) {
  try {
    const prompt = `User prompt: "${promptText}"\n\nReturn an optimized prompt and instructions for using Pixel Dojo (https://pixeldojo.ai/free-ai-image-generator-no-signup).`;
    return await callLLM(prompt);
  } catch (err) {
    return `PixelDojo helper error: ${err.message || err}`;
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

/* ---------------- Physics Tool (AskSia) ---------------- */

async function physicsTool(query) {
  try {
    const prompt = `Physics problem: ${query}\n\nSolve this step by step.`;
    return await callLLM(prompt);
  } catch (error) {
    return `Physics solver error: ${error.message}`;
  }
}

/* ---------------- Biology Tool (AI Homework Helper) ---------------- */

async function biologyTool(query) {
  try {
    const prompt = `Biology question: ${query}\n\nProvide a comprehensive answer.`;
    return await callLLM(prompt);
  } catch (error) {
    return `Biology solver error: ${error.message}`;
  }
}

/* ---------------- Web Search Tool (Perplexity-like) ---------------- */

async function webSearchTool(query) {
  try {
    const prompt = `Search query: "${query}"\n\nProvide a comprehensive web search-like answer with current information.`;
    return await callLLM(prompt);
  } catch (error) {
    return `Web search error: ${error.message}`;
  }
}

/* ---------------- Medical Info Tool (MedlinePlus-like) ---------------- */

async function medicalInfoTool(query) {
  try {
    const prompt = `Medical information query: "${query}"\n\nProvide medical information (informational only, not medical advice). Include relevant conditions, symptoms, and information sources.`;
    return await callLLM(prompt);
  } catch (error) {
    return `Medical info error: ${error.message}`;
  }
}

/* ---------------- Coding Tool (JDoodle/OneCompiler simulation) ---------------- */
/* Removed unreliable tool wrappers (coding/pdf/word) — these depended on external web UIs that
   were blocking scripted access. Their behavior now falls back to the general LLM. */

/* ---------------- Tool Selector ---------------- */

