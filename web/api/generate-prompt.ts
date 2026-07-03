import type { Request, Response } from 'express';
import { generateReply, DEFAULT_CHAIN, llmConfigured } from './lib/llm.js';

const META_PROMPT = `You are a world-class prompt engineer specializing in production AI assistants. Given a short description of what an AI assistant should do, you write a complete, professional system prompt for it.

RULES:
- Output ONLY the system prompt text. No preamble, no markdown code fences, no quotes, no explanations.
- Write in second person ("You are…", "Your role is…").
- Structure the prompt with clear sections using markdown headers (## Section).
- Every generated prompt MUST include these sections in order:
  1. ## Role & Purpose — Who the assistant is, what it does, and for whom.
  2. ## Core Capabilities — A bullet list of 4-8 specific things it can help with.
  3. ## Tone & Communication Style — How it speaks (concise/detailed, formal/casual, technical level, language).
  4. ## Response Format — How to structure answers (length, use of lists/code/tables, when to ask clarifying questions).
  5. ## Constraints & Guardrails — What it must NOT do (stay on-topic, privacy rules, escalation triggers).
  6. ## Knowledge Base Usage (only if a KB is mentioned) — How to cite and use retrieved KB content, what to say when context is insufficient.
- Make capabilities specific and concrete — avoid generic filler like "help users with their questions".
- Length: 300–500 words. Dense and actionable, not padded.`;

export default async function generatePromptHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { topic, appName, kbNames = [] } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    if (!llmConfigured()) return res.status(500).json({ error: 'No LLM provider configured' });

    // Build a rich user message so the generator has full context.
    const parts = [`Assistant description: ${topic}`];
    if (appName) parts.push(`App name: ${appName}`);
    if (kbNames.length > 0) parts.push(`Linked knowledge bases: ${kbNames.join(', ')}`);

    const userMessage = parts.join('\n') + '\n\nWrite the system prompt now.';

    // Fireworks (primary, multi-key) → Groq → Gemini.
    const generatedPrompt = await generateReply(
      [
        { role: 'system', content: META_PROMPT },
        { role: 'user', content: userMessage },
      ],
      DEFAULT_CHAIN,
      { temperature: 0.4, maxTokens: 2048 },
    );

    return res.status(200).json({ prompt: generatedPrompt.trim() });
  } catch (error: any) {
    console.error('Error generating prompt:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate prompt' });
  }
}
