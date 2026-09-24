import { analyzeSentimentWithFallback } from './textService';
import { sentimentEvaluationSet } from './sentimentEvaluationData';

const labels = ['positive', 'neutral', 'negative'];

const createConfusionMatrix = () => labels.reduce((matrix, label) => ({
  ...matrix,
  [label]: labels.reduce((row, prediction) => ({ ...row, [prediction]: 0 }), {})
}), {});

const calculateMetrics = (matrix) => {
  const total = labels.reduce((sum, label) => sum + labels.reduce((rowSum, prediction) => rowSum + matrix[label][prediction], 0), 0);
  const correct = labels.reduce((sum, label) => sum + matrix[label][label], 0);
  const perClass = {};

  labels.forEach((label) => {
    const truePositive = matrix[label][label];
    const predictedPositive = labels.reduce((sum, actual) => sum + matrix[actual][label], 0);
    const actualPositive = labels.reduce((sum, prediction) => sum + matrix[label][prediction], 0);
    const precision = predictedPositive ? truePositive / predictedPositive : 0;
    const recall = actualPositive ? truePositive / actualPositive : 0;
    perClass[label] = {
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0
    };
  });

  return {
    total,
    correct,
    incorrect: total - correct,
    accuracy: correct / total,
    macroPrecision: labels.reduce((sum, label) => sum + perClass[label].precision, 0) / labels.length,
    macroRecall: labels.reduce((sum, label) => sum + perClass[label].recall, 0) / labels.length,
    macroF1: labels.reduce((sum, label) => sum + perClass[label].f1, 0) / labels.length,
    perClass
  };
};

describe('balanced sentiment evaluation set', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  test('reports baseline metrics on the fixed 150-sample test set', async () => {
    const confusionMatrix = createConfusionMatrix();

    for (const sample of sentimentEvaluationSet) {
      const result = await analyzeSentimentWithFallback(sample.text);
      const prediction = result.status === 'available' ? result.dominantEmotion : 'unavailable';
      if (confusionMatrix[sample.label]?.[prediction] !== undefined) {
        confusionMatrix[sample.label][prediction] += 1;
      }
    }

    const metrics = calculateMetrics(confusionMatrix);
    console.log(JSON.stringify({
      samples: sentimentEvaluationSet.length,
      positive: sentimentEvaluationSet.filter((sample) => sample.label === 'positive').length,
      neutral: sentimentEvaluationSet.filter((sample) => sample.label === 'neutral').length,
      negative: sentimentEvaluationSet.filter((sample) => sample.label === 'negative').length,
      ...metrics,
      confusionMatrix
    }, null, 2));

    expect(sentimentEvaluationSet).toHaveLength(150);
    expect(sentimentEvaluationSet.filter((sample) => sample.label === 'positive')).toHaveLength(50);
    expect(sentimentEvaluationSet.filter((sample) => sample.label === 'neutral')).toHaveLength(50);
    expect(sentimentEvaluationSet.filter((sample) => sample.label === 'negative')).toHaveLength(50);
    expect(metrics.total).toBe(150);
  });
});
