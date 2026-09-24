import { analyzeSentimentWithFallback, combineSentimentPredictions } from './textService';

describe('analyzeSentimentWithFallback', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  test('classifies a clearly positive phrase as positive', async () => {
    const result = await analyzeSentimentWithFallback('Hello Good Morning');
    expect(result.dominantEmotion).toBe('positive');
  });

  test('classifies a clearly negative phrase as negative', async () => {
    const result = await analyzeSentimentWithFallback('You Son Of A Bitch');
    expect(result.dominantEmotion).toBe('negative');
  });

  test('keeps neutral text neutral when it has no strong polarity', async () => {
    const result = await analyzeSentimentWithFallback('The meeting starts at 10 AM tomorrow.');
    expect(result.dominantEmotion).toBe('neutral');
  });

  test('keeps sentiment scores consistent with the dominant label', async () => {
    const result = await analyzeSentimentWithFallback('I am extremely disappointed with this terrible experience.');
    expect(result.dominantEmotion).toBe('negative');
    expect(result.negativeScore).toBeGreaterThan(result.positiveScore);
  });

  test('combines validated Gemini scores with VADER evidence', () => {
    const result = combineSentimentPredictions(
      { positiveScore: 90, neutralScore: 5, negativeScore: 5 },
      { vader: { compound: -0.2 }, scores: { positive: 0, neutral: 80, negative: 20 } }
    );

    expect(result.dominantEmotion).toBe('positive');
    expect(result.positiveScore).toBeGreaterThan(50);
    expect(result.negativeScore).toBeGreaterThan(5);
  });

  test('uses a validated Gemini response when it agrees with local evidence', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sentiment: { positiveScore: 80, neutralScore: 15, negativeScore: 5, dominantEmotion: 'positive' } })
    });

    const result = await analyzeSentimentWithFallback('I am happy with this result.');

    expect(result.status).toBe('available');
    expect(result.source).toBe('proxy+local-model');
    expect(result.dominantEmotion).toBe('positive');
  });
});
