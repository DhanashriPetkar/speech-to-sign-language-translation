import { SIGN_SOURCES, SIGN_TYPES } from './signTypes';

const SUPPORTED_CHARACTERS = /^[a-z0-9]$/i;

const getAssetSource = (assets, character) => {
  const asset = assets?.[character.toLowerCase()];
  if (!asset) return null;
  return typeof asset === 'string' ? asset : asset.src || null;
};

/**
 * Resolves one token into static alphabet/numeric sign representations.
 * Spaces are token boundaries and unsupported symbols become unavailable entries.
 */
export const resolveFingerspelling = (token, assets = {}) => Array.from(String(token || '')).map((character) => {
  const normalizedCharacter = character.toLowerCase();
  const asset = SUPPORTED_CHARACTERS.test(character) ? getAssetSource(assets, normalizedCharacter) : null;

  return {
    type: SIGN_TYPES.FINGERSPELL,
    value: character.toUpperCase(),
    source: asset ? SIGN_SOURCES.ALPHABET_DATASET : SIGN_SOURCES.UNSUPPORTED,
    animationAvailable: Boolean(asset),
    asset,
    token: String(token)
  };
});
