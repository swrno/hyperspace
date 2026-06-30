import type { Request, Response } from 'express';
import { getDb } from './mongodb.js';
import { graphSearch } from './cognee.js';
import { verifyToken } from './auth.js';

export default async function appChatHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { appId, message, systemPrompt, model, temperature, maxTokens, topP, history = [], linkedKbIds = [] } = req.body;

    if (!appId || !message) {
      return res.status(400).json({ error: 'appId and message are required' });
    }

    let userId = 'anonymous';
    try {
      const user = await verifyToken(req);
      if (user && user.uid) {
        userId = user.uid;
      }
    } catch (err) {
      // Allow fallback if needed, or reject
      if (req.headers.authorization && req.headers.authorization.length > 10) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
    }

    const messages = [];

    let retrievedContext = '';
    // If the app has linked KBs, retrieve context from Cognee
    if (linkedKbIds && linkedKbIds.length > 0) {
      // In Cognee, each KB acts as a dataset
      try {
        const fetchPromises = linkedKbIds.map((kbId: string) => 
          graphSearch(message, { userId: kbId, searchType: 'GRAPH_COMPLETION', topK: 10 })
        );
        const results = await Promise.all(fetchPromises);
        retrievedContext = results.filter(r => r).join('\n\n');
      } catch (err) {
        console.warn('Failed to retrieve from Cognee KBs:', err);
      }
    }

    let finalSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
    if (retrievedContext) {
      finalSystemPrompt += `\n\n# Context from Knowledge Base:\nThe following information is retrieved from the knowledge base. Use it to answer the user's question:\n${retrievedContext}`;
    }

    messages.push({ role: 'system', content: finalSystemPrompt });
    
    // Add history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    
    // Add new user message
    messages.push({ role: 'user', content: message });

    // Call Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: model || 'llama3-8b-8192',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 1024,
        top_p: topP ?? 1
      })
    });

    if (!groqRes.ok) {
      const errTxt = await groqRes.text();
      console.error('Groq API Error:', errTxt);
      throw new Error(`Groq API Error: ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    const replyContent = groqData.choices?.[0]?.message?.content || '';

    // We don't save to DB here because the frontend maintains its own state and calls updateApp?
    // Wait, the user specifically requested: "Store User message as history. When Ever I am creating an app in UI it should store all the info in MongoDB. Every app should have a APP_ID, API_KEY. Store A-Z info like model it currently selected. Temo, top_p, sys_prompt, User message as history."

    // So we should save the new messages to MongoDB.
    const db = await getDb();
    const appsCollection = db.collection('apps');
    
    const userMsgObj = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString() };
    const aiMsgObj = { id: Date.now() + 1, role: 'assistant', content: replyContent, timestamp: new Date().toISOString() };

    await appsCollection.updateOne(
      { id: appId },
      { $push: { messages: { $each: [userMsgObj, aiMsgObj] } } }
    );

    return res.status(200).json({
      userMessage: userMsgObj,
      aiMessage: aiMsgObj
    });
  } catch (error: any) {
    console.error('Error in app chat:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
}
