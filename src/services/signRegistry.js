/**
 * Central vocabulary extension point for verified word-level sign assets.
 * Keep this empty until a real, verified animation asset is available.
 */
export const SIGN_REGISTRY = Object.freeze({});

export const getRegisteredWordSign = (word) => {
  const entry = SIGN_REGISTRY[String(word).trim().toLowerCase()];

  if (!entry || entry.type !== 'word' || entry.animationAvailable !== true || !entry.animation) {
    return null;
  }

  return entry;
};
