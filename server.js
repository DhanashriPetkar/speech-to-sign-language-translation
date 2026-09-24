require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { DeepgramClient } = require('@deepgram/sdk');

const app = express();
const port = process.env.PORT || 3001;
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const transcriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (String(file.mimetype || '').toLowerCase().startsWith('audio/')) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported audio MIME type'));
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/transcribe', (req, res) => {
  transcriptionUpload.single('audio')(req, res, async (uploadError) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Audio recording is too large. Please record a shorter clip.' });
      }
      return res.status(400).json({ error: uploadError.message || 'Invalid audio upload.' });
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey || deepgramApiKey === 'THE_USER_WILL_PASTE_THEIR_KEY_HERE') {
      return res.status(500).json({ error: 'Speech transcription service is not configured.' });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ error: 'No audio was uploaded.' });
    }

    console.log('[STT] Deepgram transcription request received');

    try {
      const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });
      const response = await deepgram.listen.v1.media.transcribeFile(req.file.buffer, {
        model: 'nova-3',
        smart_format: true
      });
      const transcript = response?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

      console.log('[STT] Deepgram transcription completed');
      if (!transcript) {
        return res.status(422).json({ error: 'No speech was detected in the recording.' });
      }
      return res.json({ transcript });
    } catch (error) {
      return res.status(502).json({ error: 'Deepgram transcription failed. Please try again.' });
    }
  });
});

app.post('/api/gemini', async (req, res) => {
  const { action = 'normalize', text = '' } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured.' });
  }

  const promptMap = {
    normalize: `Add proper punctuation and capitalization to this text and return only the corrected text: "${text}"`,
    sentiment: `Analyze the overall sentiment of the supplied text, including negation, contrast, tone, insults, profanity, and context. Do not classify from an isolated keyword. Return only valid JSON with these exact keys: sentiment, positiveScore, neutralScore, negativeScore. sentiment must be exactly positive, neutral, or negative. Scores must be numbers from 0 to 100, sum to 100, and the sentiment label must match the highest score. Text to classify: "${text}"`
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
      throw new Error('Gemini request failed');
    }

    const rawText = data.candidates[0].content.parts[0].text.trim();

    if (action === 'sentiment') {
      const match = rawText.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      const sentiment = parsed && typeof parsed === 'object' ? parsed : null;

      if (!sentiment) {
        throw new Error('Sentiment payload malformed');
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

      return res.json({
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

    return res.json({ text: rawText });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to process the text with Gemini.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Speech-to-sign backend running on http://localhost:${port}`);
});
