import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ---------------- LLM (Decider + Refiner) ---------------- */

async function callLLM(prompt) {
  const url = "https://api-inference.huggingface.co/models/gpt2";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt })
  });
  const data = await res.json();
  return data?.[0]?.generated_text || "";
}

/* ---------------- Math Tool ---------------- */

async function mathTool(query) {
  const url = `https://api.mathjs.org/v4/?expr=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  return await res.text();
}

/* ---------------- News Tool ---------------- */

async function newsTool(query) {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`;
  const res = await fetch(proxy);
  return await res.text();
}

/* ---------------- Chemistry Tool ---------------- */

async function chemistryTool(query) {
  const url = `https://www.rhea-db.org/rhea/?query=${encodeURIComponent(
    query
  )}&columns=rhea-id,equation&format=tsv&limit=5`;
  const res = await fetch(url);
  return await res.text();
}

/* ---------------- Tool Selector ---------------- */

async function decideTool(input, tools) {
  const prompt = `
User query: "${input}"
Available tools: ${tools.join(", ")}

Respond with exactly ONE word:
math_tool OR news_tool OR chemistry_tool
`;

  const response = await callLLM(prompt);
  return response.toLowerCase().includes("math")
    ? "math_tool"
    : response.toLowerCase().includes("news")
    ? "news_tool"
    : "chemistry_tool";
}

/* ---------------- Main Route ---------------- */

app.post("/answer", async (req, res) => {
  try {
    const { input, tools_choosen } = req.body;

    const selectedTool = await decideTool(input, tools_choosen);

    let toolResult = "";

    if (selectedTool === "math_tool") {
      toolResult = await mathTool(input);
    } else if (selectedTool === "news_tool") {
      toolResult = await newsTool(input);
    } else if (selectedTool === "chemistry_tool") {
      toolResult = await chemistryTool(input);
    }

    const refinePrompt = `
User asked: "${input}"
Tool used: ${selectedTool}
Tool output:
${toolResult}

Give a clear final answer:
`;

    const finalAnswer = await callLLM(refinePrompt);

    res.json({
      tool_used: selectedTool,
      answer: finalAnswer.trim()
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/* ---------------- Server ---------------- */

const PORT = 4000;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
