(async () => {
  try {
    const path = require('path');
    const fileUrl = `file://${path.resolve(__dirname, '../netlify/functions/answer.js')}`;
    const mod = await import(fileUrl);
    if (!mod || !mod.handler) {
      console.error('handler not found in module');
      process.exit(2);
    }

    const tests = [
      {
        input: 'What are the types of flowers?',
        tools_choosen: ['science']
      },
      {
        input: 'sqrt of 16',
        tools_choosen: ['math_tool']
      }
    ];

    for (const t of tests) {
      const event = { httpMethod: 'POST', body: JSON.stringify({ input: t.input, tools_choosen: t.tools_choosen, conversation_history: [] }) };
      const res = await mod.handler(event, {});
      console.log('\n--- Test:', t.input);
      console.log('handler response status:', res.statusCode);
      try { console.log('body:', JSON.parse(res.body)); } catch (e) { console.log('body (raw):', res.body); }
    }
  } catch (err) {
    console.error('test script error:', err);
    process.exit(1);
  }
})();
