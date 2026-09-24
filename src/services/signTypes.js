/**
 * @typedef {'fingerspell'|'word'} SignType
 * @typedef {'alphabet-dataset'|'word-registry'|'unsupported'} SignSource
 *
 * @typedef {Object} SignRepresentation
 * @property {SignType} type
 * @property {string} value
 * @property {SignSource} source
 * @property {boolean} animationAvailable
 * @property {string|null} asset
 * @property {string} token
 */

export const SIGN_TYPES = Object.freeze({
  FINGERSPELL: 'fingerspell',
  WORD: 'word'
});

export const SIGN_SOURCES = Object.freeze({
  ALPHABET_DATASET: 'alphabet-dataset',
  WORD_REGISTRY: 'word-registry',
  UNSUPPORTED: 'unsupported'
});
