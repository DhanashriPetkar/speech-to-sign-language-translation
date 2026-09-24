const multer = require('multer');
const { DeepgramClient } = require('@deepgram/sdk');

const transcriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (String(file.mimetype || '').toLowerCase().startsWith('audio/')) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported audio MIME type'));
  }
});

const parseAudioUpload = (req, res) => new Promise((resolve, reject) => {
  transcriptionUpload.single('audio')(req, res, (error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb'
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await parseAudioUpload(req, res);
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Audio recording is too large. Please record a shorter clip.' });
    }
    return res.status(400).json({ error: error.message || 'Invalid audio upload.' });
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey || deepgramApiKey === 'THE_USER_WILL_PASTE_THEIR_KEY_HERE') {
    return res.status(500).json({ error: 'Speech transcription service is not configured.' });
  }
  if (!req.file || !req.file.buffer?.length) {
    return res.status(400).json({ error: 'No audio was uploaded.' });
  }

  try {
    const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });
    const response = await deepgram.listen.v1.media.transcribeFile(req.file.buffer, {
      model: 'nova-3',
      smart_format: true
    });
    const transcript = response?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

    if (!transcript) {
      return res.status(422).json({ error: 'No speech was detected in the recording.' });
    }
    return res.status(200).json({ transcript });
  } catch (error) {
    return res.status(502).json({ error: 'Deepgram transcription failed. Please try again.' });
  }
}