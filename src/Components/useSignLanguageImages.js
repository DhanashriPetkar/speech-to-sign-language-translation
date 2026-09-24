import { useEffect, useMemo, useState } from 'react';

const ASL_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

const normalizeAssetUrl = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.default) return value.default;
  return value;
};

const useSignLanguageImages = () => {
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requiredCharacters = useMemo(() => Array.from(ASL_CHARACTERS), []);

  useEffect(() => {
    let isMounted = true;

    try {
      const imageContext = require.context('../assets/assets/asl_dataset', true, /\.(png|jpe?g|svg|webp)$/);
      const allImages = imageContext.keys().map((key) => ({
        key,
        src: normalizeAssetUrl(imageContext(key))
      }));

      const nextImages = {};

      requiredCharacters.forEach((character) => {
        const matchingImages = allImages.filter((entry) => entry.key.includes(`/${character}/`));
        if (matchingImages.length > 0) {
          const selected = matchingImages[Math.floor(Math.random() * matchingImages.length)];
          nextImages[character] = { src: selected.src, alt: `ASL sign for ${character}` };
        }
      });

      if (isMounted) {
        setImages(nextImages);
        setLoading(false);
      }
    } catch (err) {
      if (isMounted) {
        setError('Unable to load ASL dataset.');
        setLoading(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [requiredCharacters]);

  return { images, loading, error };
};

export default useSignLanguageImages;
