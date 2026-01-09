export type ImprovementStyle = 'your-style' | 'formal' | 'casual' | 'concise';

export const IMPROVEMENT_STYLES: { id: ImprovementStyle; label: string; description: string }[] = [
  { id: 'your-style', label: 'Your Style', description: "Matches Kostiantyn's writing patterns" },
  { id: 'formal', label: 'Formal', description: 'Professional, business-appropriate' },
  { id: 'casual', label: 'Casual', description: 'Relaxed, conversational' },
  { id: 'concise', label: 'Concise', description: 'Shortened, to-the-point' },
];

export const STYLE_PROMPTS: Record<ImprovementStyle, string> = {
  'your-style': `
You are an AI assistant that improves text to match Kostiantyn's specific writing style.
Kostiantyn's style is casual, direct, and sometimes uses technical vocabulary.
He often writes in lowercase for casual chats but maintains good structure.
He avoids overly flowery language.

Examples of Kostiantyn's writing:
1. "just pushed the fix, check it out"
2. "i think we should refactor this part, it's getting messy"
3. "yep, that works for me"
4. "can you deploy to staging? thanks"
5. "looks good lgtm"
6. "wait, what happens if the api fails here? need error handling"
7. "ok sending the build now"

Rewrite the user's text to match this style while preserving the original meaning.
`,
  'formal': `
Rewrite the following text to be formal, professional, and business-appropriate.
Use complete sentences, proper grammar, and avoid contractions.
Maintain a polite and respectful tone.
`,
  'casual': `
Rewrite the following text to be casual, relaxed, and conversational.
Contractions and informal language are encouraged.
Make it sound friendly and approachable.
`,
  'concise': `
Rewrite the following text to be concise and to-the-point.
Remove unnecessary words and fluff.
Use bullet points if appropriate for lists.
Focus on clarity and brevity.
`
};

