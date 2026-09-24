import { SentimentIntensityAnalyzer } from 'vader-sentiment';

const POSITIVE_COLOR = '#4CAF50';
const NEUTRAL_COLOR = '#FFC107';
const NEGATIVE_COLOR = '#F44336';

const normalizeSentimentLabel = (value = '') => {
  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'positive' || normalized === 'pos') return 'positive';
  if (normalized === 'negative' || normalized === 'neg') return 'negative';
  if (normalized === 'neutral') return 'neutral';
  return '';
};

const buildChartData = (positiveScore, neutralScore, negativeScore) => [
  { name: 'Positive', value: positiveScore, color: POSITIVE_COLOR },
  { name: 'Neutral', value: neutralScore, color: NEUTRAL_COLOR },
  { name: 'Negative', value: negativeScore, color: NEGATIVE_COLOR }
];

const getDominantEmotion = (scores) => {
  const entries = Object.entries(scores);
  const highest = Math.max(...entries.map(([, value]) => value));
  const winners = entries.filter(([, value]) => value === highest);
  return winners.length === 1 ? winners[0][0] : 'neutral';
};

export function validateSentimentPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Sentiment response is missing.');
  }

  const scores = {
    positive: Number(payload.positiveScore),
    neutral: Number(payload.neutralScore),
    negative: Number(payload.negativeScore)
  };
  const label = normalizeSentimentLabel(payload.dominantEmotion || payload.sentiment);
  const total = scores.positive + scores.neutral + scores.negative;

  if (!label || Object.values(scores).some((score) => !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error('Sentiment response contains invalid labels or scores.');
  }

  if (Math.abs(total - 100) > 1) {
    throw new Error('Sentiment response scores must sum to 100.');
  }

  const dominantEmotion = getDominantEmotion(scores);
  if (label !== dominantEmotion) {
    throw new Error('Sentiment label does not match the highest score.');
  }

  return {
    positiveScore: scores.positive,
    neutralScore: scores.neutral,
    negativeScore: scores.negative,
    dominantEmotion,
    chartData: buildChartData(scores.positive, scores.neutral, scores.negative),
    status: 'available'
  };
}

export function normalizeText(text = '') {
  const trimmed = text.trim();

  if (!trimmed) {
    return '';
  }

  const words = trimmed
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      const normalized = word.replace(/[^a-zA-Z0-9']/g, '');
      if (!normalized) return '';
      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    })
    .filter(Boolean);

  const sentence = words.join(' ');
  return sentence.replace(/\s+([,.!?;:])/g, '$1').replace(/([.!?])(?=[A-Za-z0-9])/g, '$1 ');
}

export async function processTextWithFallback(text) {
  const cleanedText = normalizeText(text);

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'normalize', text: cleanedText })
    });

    if (!response.ok) {
      throw new Error('Gemini proxy unavailable');
    }

    const data = await response.json();
    return { text: data.text || cleanedText, source: 'proxy' };
  } catch (error) {
    return { text: cleanedText, source: 'fallback' };
  }
}

export function getLocalSentimentEvidence(text) {
  const cleanText = normalizeText(text);
  const result = SentimentIntensityAnalyzer.polarity_scores(cleanText);
  const compound = result.compound || 0;
  const positiveScore = compound > 0.05 ? Number((50 + compound * 50).toFixed(2)) : 0;
  const negativeScore = compound < -0.05 ? Number((50 + Math.abs(compound) * 50).toFixed(2)) : 0;
  const neutralScore = Number((100 - positiveScore - negativeScore).toFixed(2));
  const scores = { positive: positiveScore, neutral: neutralScore, negative: negativeScore };

  return {
    vader: result,
    prediction: getDominantEmotion(scores),
    scores
  };
}

export function combineSentimentPredictions(geminiPrediction, vaderEvidence) {
  const geminiScores = {
    positive: geminiPrediction.positiveScore,
    neutral: geminiPrediction.neutralScore,
    negative: geminiPrediction.negativeScore
  };
  const vaderScores = vaderEvidence.scores;
  const geminiConfidence = Math.max(...Object.values(geminiScores)) / 100;
  const vaderConfidence = Math.abs(vaderEvidence.vader.compound || 0);
  const totalConfidence = geminiConfidence + vaderConfidence;

  if (!totalConfidence) {
    return geminiPrediction;
  }

  const combinedScores = Object.keys(geminiScores).reduce((scores, label) => ({
    ...scores,
    [label]: (geminiScores[label] * geminiConfidence + vaderScores[label] * vaderConfidence) / totalConfidence
  }), {});

  return validateSentimentPayload({
    positiveScore: combinedScores.positive,
    neutralScore: combinedScores.neutral,
    negativeScore: combinedScores.negative,
    dominantEmotion: getDominantEmotion(combinedScores)
  });
}

function buildLocalSentiment(cleanText) {
  const evidence = getLocalSentimentEvidence(cleanText);
  const { positive: positiveScore, neutral: neutralScore, negative: negativeScore } = evidence.scores;
  const scores = { positive: positiveScore, neutral: neutralScore, negative: negativeScore };

  return {
    ...validateSentimentPayload({
      positiveScore,
      neutralScore,
      negativeScore,
      dominantEmotion: getDominantEmotion(scores)
    }),
    source: 'local-model'
  };
}

export async function analyzeSentimentWithFallback(text) {
  const cleanText = normalizeText(text);

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sentiment', text: cleanText })
    });

    if (!response.ok) {
      throw new Error('Gemini proxy unavailable');
    }

    const data = await response.json();
    const geminiPrediction = validateSentimentPayload(data.sentiment || data);
    const vaderEvidence = getLocalSentimentEvidence(cleanText);
    return {
      ...combineSentimentPredictions(geminiPrediction, vaderEvidence),
      source: 'proxy+local-model'
    };
  } catch (error) {
    try {
      return buildLocalSentiment(cleanText);
    } catch (localError) {
      return { status: 'unavailable', source: 'unavailable', error: localError.message || error.message };
    }
  }
}
