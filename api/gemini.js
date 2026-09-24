export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, text } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured.' });
  }

  const promptMap = {
    normalize: `Add proper punctuation and capitalization to this text and return only the corrected text: "${text || ''}"`,
    sentiment: `Analyze the overall sentiment of the supplied text, including negation, contrast, tone, insults, profanity, and context. Do not classify from an isolated keyword. Return only valid JSON with these exact keys: sentiment, positiveScore, neutralScore, negativeScore. sentiment must be exactly positive, neutral, or negative. Scores must be numbers from 0 to 100, sum to 100, and the sentiment label must match the highest score. Text to classify: "${text || ''}"`
  };

  const prompt = promptMap[action] || promptMap.normalize;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200, responseMimeType: 'application/json' }
      })
    });

    const data = await response.json();

    if (!response.ok || !data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Gemini API request failed');
    }

    const rawText = data.candidates[0].content.parts[0].text.trim();

    if (action === 'sentiment') {
      const match = rawText.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      const sentiment = parsed && typeof parsed === 'object' ? parsed : null;

      if (!sentiment) {
        throw new Error('Sentiment payload could not be parsed');
      }

      const scores = {
        positive: Number(sentiment.positiveScore),
        neutral: Number(sentiment.neutralScore),
        negative: Number(sentiment.negativeScore)
      };
      const label = String(sentiment.sentiment || sentiment.dominantEmotion || '').toLowerCase();
      const total = scores.positive + scores.neutral + scores.negative;
      const highest = Math.max(...Object.values(scores));
      const dominantEmotion = Object.entries(scores).find(([, value]) => value === highest)?.[0];

      if (!['positive', 'neutral', 'negative'].includes(label)
        || Object.values(scores).some((score) => !Number.isFinite(score) || score < 0 || score > 100)
        || Math.abs(total - 100) > 1
        || label !== dominantEmotion) {
        throw new Error('Sentiment response failed validation');
      }

      return res.status(200).json({
        sentiment: {
          positiveScore: scores.positive,
          neutralScore: scores.neutral,
          negativeScore: scores.negative,
          dominantEmotion,
          chartData: [
            { name: 'Positive', value: scores.positive, color: '#4CAF50' },
            { name: 'Neutral', value: scores.neutral, color: '#FFC107' },
            { name: 'Negative', value: scores.negative, color: '#F44336' }
          ]
        }
      });
    }

    return res.status(200).json({ text: rawText });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to process text with Gemini.' });
  }
}
