import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import useSignLanguageImages from './useSignLanguageImages';

const SignLanguageAnimator = ({ text, signSequence, images, loading: imagesLoading, error: imagesError, speed = 1 }) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [animationCompleted, setAnimationCompleted] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(speed);
  const animationRef = useRef(null);

  const dataset = useSignLanguageImages();
  const signImages = images || dataset.images;
  const loading = imagesLoading ?? dataset.loading;
  const error = imagesError || dataset.error;

  const signTokens = useMemo(() => {
    if (Array.isArray(signSequence)) {
      return signSequence.reduce((groups, sign) => {
        const previous = groups[groups.length - 1];
        if (previous && previous.token === sign.token) {
          previous.signs.push(sign);
          return groups;
        }

        return [...groups, { token: sign.token, signs: [sign] }];
      }, []);
    }

    return (text ? text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean) : [])
      .map((word) => ({ token: word, signs: Array.from(word).map((letter) => ({ value: letter, asset: signImages[letter] })) }));
  }, [signSequence, text, signImages]);

  const currentToken = signTokens[currentWordIndex] || { token: '', signs: [] };
  const currentWord = currentToken.token || '';
  const currentSigns = currentToken.signs;

  useEffect(() => {
    if (!isPlaying || signTokens.length === 0 || animationCompleted) return;

    if (currentLetterIndex >= currentSigns.length) {
      const nextWordTimer = setTimeout(() => {
        if (currentWordIndex < signTokens.length - 1) {
          setCurrentWordIndex(currentWordIndex + 1);
          setCurrentLetterIndex(0);
        } else {
          setIsPlaying(false);
          setAnimationCompleted(true);
        }
      }, 1000 / animationSpeed);
      return () => clearTimeout(nextWordTimer);
    }

    animationRef.current = setTimeout(() => {
      setCurrentLetterIndex((prev) => prev + 1);
    }, 1000 / animationSpeed);

    return () => clearTimeout(animationRef.current);
  }, [currentWordIndex, currentLetterIndex, currentWord, currentSigns, signTokens, isPlaying, animationCompleted, animationSpeed]);

  useEffect(() => {
    setCurrentWordIndex(0);
    setCurrentLetterIndex(0);
    setIsPlaying(true);
    setAnimationCompleted(false);
    setAnimationSpeed(speed);
  }, [text, speed]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    setCurrentWordIndex(0);
    setCurrentLetterIndex(0);
    setIsPlaying(true);
    setAnimationCompleted(false);
  };

  const totalLetters = signTokens.reduce((total, token) => total + token.signs.length, 0);
  const completedLetters = signTokens
    .slice(0, currentWordIndex)
    .reduce((total, token) => total + token.signs.length, 0);
  const displayedLetters = Math.min(currentLetterIndex + 1, currentSigns.length);
  const progress = Math.min(completedLetters + displayedLetters, totalLetters);
  const currentSign = currentSigns[currentLetterIndex];
  const nextSign = currentSigns[currentLetterIndex + 1] || signTokens[currentWordIndex + 1]?.signs[0];

  return (
    <div className="sign-output">
      <div className="sign-output-header">
        <div>
          <p className="eyebrow">Current sign</p>
          <h3>Alphabet fingerspelling output</h3>
        </div>
        <label className="speed-control">
          <span>Speed</span>
          <select value={animationSpeed} onChange={(event) => setAnimationSpeed(Number(event.target.value))} aria-label="Signing speed">
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </label>
      </div>

      <div className="sign-output-toolbar">
        <div className="current-word">
          Word: <strong>{currentWord || 'Waiting for text'}</strong>
        </div>
        <div className="sign-controls">
          <button
            type="button"
            onClick={handlePlayPause}
            className="control-button control-button-primary"
            aria-label={isPlaying ? 'Pause sign sequence' : 'Play sign sequence'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="control-button"
            aria-label="Replay sign sequence"
          >
            Replay
          </button>
        </div>
      </div>

      <div className="sign-visualization">
        {loading ? (
          <div className="sign-empty">Loading signs...</div>
        ) : error ? (
          <div className="sign-empty sign-empty-error">Sign assets could not be loaded.</div>
        ) : signTokens.length === 0 ? (
          <div className="sign-empty">Enter text to see the fingerspelling sequence.</div>
        ) : animationCompleted ? (
          <div className="sign-empty sign-empty-complete">Sequence complete.</div>
        ) : (
          <div className="sign-letter-row">
            {currentSigns.slice(0, currentLetterIndex + 1).map((sign, index) => (
              <motion.div
                key={index}
                className="sign-letter"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                {sign.asset || signImages[sign.value.toLowerCase()] ? (
                  <img
                    src={sign.asset || signImages[sign.value.toLowerCase()]?.src}
                    alt={`Sign for letter ${sign.value}`}
                    className="sign-letter-image"
                  />
                ) : (
                  <div className="sign-missing" aria-label={`Sign asset missing for ${sign.value}`}>?</div>
                )}
                <div className="sign-letter-label">{sign.value.toUpperCase()}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="sign-status-grid" aria-live="polite">
        <div><span>Currently displaying</span><strong>{currentSign?.value ? currentSign.value.toUpperCase() : '--'}</strong></div>
        <div><span>Next</span><strong>{nextSign?.value ? nextSign.value.toUpperCase() : '--'}</strong></div>
        <div><span>Progress</span><strong>{progress} / {totalLetters || 0}</strong></div>
      </div>
    </div>
  );
};

export default SignLanguageAnimator;
