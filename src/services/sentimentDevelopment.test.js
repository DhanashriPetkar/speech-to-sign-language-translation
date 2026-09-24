import { analyzeSentimentWithFallback } from './textService';
import { sentimentDevelopmentSet } from './sentimentEvaluationData';

describe('sentiment development set', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  test('reports development-set accuracy separately from the frozen test set', async () => {
    let correct = 0;

    for (const sample of sentimentDevelopmentSet) {
      const result = await analyzeSentimentWithFallback(sample.text);
      if (result.dominantEmotion === sample.label) correct += 1;
    }

    const accuracy = correct / sentimentDevelopmentSet.length;
    console.log(JSON.stringify({ samples: sentimentDevelopmentSet.length, correct, incorrect: sentimentDevelopmentSet.length - correct, accuracy }, null, 2));

    expect(sentimentDevelopmentSet).toHaveLength(48);
  });
});
