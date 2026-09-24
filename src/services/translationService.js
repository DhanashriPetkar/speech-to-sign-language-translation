import { resolveSignSequence } from './signResolver';

/**
 * Converts processed English into the intermediate sign representation.
 * This preserves token order and does not claim to perform ASL grammar translation.
 */
export const translateTextToSigns = (text, assets = {}) => ({
  inputText: String(text || ''),
  signs: resolveSignSequence(text, assets)
});
