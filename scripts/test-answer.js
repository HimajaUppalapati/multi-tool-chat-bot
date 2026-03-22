(async () => {
  try {
    const path = require('path');
    const fileUrl = `file://${path.resolve(__dirname, '../netlify/functions/answer.js')}`;
    const mod = await import(fileUrl);
    if (!mod || !mod.handler) {
      console.error('handler not found in module');
      process.exit(2);
    }

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        input: 'Hi',
        tools_choosen: ['science'],
        conversation_history: [
          { sender: 'user', text: 'Hi' },
          { sender: 'assistant', text: "Hello! I'm your AI assistant. How can I help you today?" }
        ]
      })
    };

    const res = await mod.handler(event, {});
    console.log('handler response status:', res.statusCode);
    try { console.log('body:', JSON.parse(res.body)); } catch (e) { console.log('body (raw):', res.body); }
  } catch (err) {
    console.error('test script error:', err);
    process.exit(1);
  }
})();
