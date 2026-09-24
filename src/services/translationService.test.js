import { translateTextToSigns } from './translationService';
import { resolveFingerspelling } from './fingerspellingResolver';
import { resolveSignSequence } from './signResolver';

const assets = {
  a: { src: '/a.jpeg' },
  d: { src: '/d.jpeg' },
  e: { src: '/e.jpeg' },
  h: { src: '/h.jpeg' },
  l: { src: '/l.jpeg' },
  o: { src: '/o.jpeg' },
  '1': { src: '/1.jpeg' },
  '2': { src: '/2.jpeg' },
  '3': { src: '/3.jpeg' }
};

describe('translation layer', () => {
  test('resolves a single letter as one fingerspelling sign', () => {
    expect(resolveFingerspelling('A', assets)).toEqual([expect.objectContaining({
      type: 'fingerspell',
      value: 'A',
      source: 'alphabet-dataset',
      animationAvailable: true,
      asset: '/a.jpeg'
    })]);
  });

  test('resolves HELLO letter by letter without inventing a word sign', () => {
    const result = resolveSignSequence('HELLO', assets);
    expect(result.map((sign) => sign.value)).toEqual(['H', 'E', 'L', 'L', 'O']);
    expect(result.every((sign) => sign.type === 'fingerspell')).toBe(true);
  });

  test('handles mixed case and proper names consistently', () => {
    const mixedCase = resolveSignSequence('Hello', assets);
    const properName = resolveSignSequence('Dhanashri', assets);

    expect(mixedCase.map((sign) => sign.value)).toEqual(['H', 'E', 'L', 'L', 'O']);
    expect(properName.map((sign) => sign.value)).toEqual(Array.from('DHANASHRI'));
  });

  test('resolves digits through the existing numeric asset folders', () => {
    expect(resolveSignSequence('123', assets).map((sign) => sign.value)).toEqual(['1', '2', '3']);
  });

  test('preserves sentence token order in the intermediate representation', () => {
    const result = translateTextToSigns('I am happy', assets);
    expect(result.inputText).toBe('I am happy');
    expect(result.signs.map((sign) => sign.token)).toEqual(['I', 'am', 'am', 'happy', 'happy', 'happy', 'happy', 'happy']);
    expect(result.signs.every((sign) => sign.type === 'fingerspell')).toBe(true);
  });

  test('returns an empty sequence for empty input', () => {
    expect(resolveSignSequence('')).toEqual([]);
  });

  test('represents unsupported symbols as unavailable without throwing', () => {
    const result = resolveSignSequence('A!@', assets);
    expect(result.map((sign) => sign.value)).toEqual(['A', '!', '@']);
    expect(result.slice(1).every((sign) => sign.animationAvailable === false)).toBe(true);
  });
});
