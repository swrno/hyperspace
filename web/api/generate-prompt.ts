import type { Request, Response } from 'express';

export default async function generatePromptHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert at writing system prompts for AI assistants. The user will provide a brief topic or requirement. Your job is to output ONLY the generated system prompt text. Do not include quotes around the prompt or markdown code blocks. Just the raw system prompt text. It should be highly detailed, clear, and professional.' },
          { role: 'user', content: `Create a system prompt for: ${topic}` }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!groqRes.ok) {
      const errTxt = await groqRes.text();
      throw new Error(`Groq API Error: ${groqRes.status} ${errTxt}`);
    }

    const groqData = await (groqRes.json() as any);
    const generatedPrompt = groqData.choices?.[0]?.message?.content || '';

    return res.status(200).json({ prompt: generatedPrompt.trim() });
  } catch (error: any) {
    console.error('Error generating prompt:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate prompt' });
  }
}
