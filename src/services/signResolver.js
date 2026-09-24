import { resolveFingerspelling } from './fingerspellingResolver';
import { getRegisteredWordSign } from './signRegistry';
import { SIGN_SOURCES, SIGN_TYPES } from './signTypes';

export const resolveToken = (token, assets = {}) => {
  const normalizedToken = String(token || '');
  const registeredSign = getRegisteredWordSign(normalizedToken);

  if (registeredSign) {
    return [{
      type: SIGN_TYPES.WORD,
      value: normalizedToken,
      source: SIGN_SOURCES.WORD_REGISTRY,
      animationAvailable: true,
      asset: registeredSign.animation,
      token: normalizedToken
    }];
  }

  return resolveFingerspelling(normalizedToken, assets);
};

export const resolveSignSequence = (text, assets = {}) => {
  const tokens = String(text || '').match(/[a-z0-9]+|[^\s\w]/gi) || [];
  return tokens.flatMap((token) => resolveToken(token, assets));
};
