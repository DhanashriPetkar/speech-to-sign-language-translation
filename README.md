# Speech-to-Sign Studio

Speech-to-Sign Studio is a polished React application that records speech or accepts manual text, normalizes the transcript, analyzes sentiment, and renders ASL sign images for the generated sequence. It is oriented toward a portfolio-quality demo of a practical speech-to-sign workflow.

## Main features

- Microphone recording and stop controls
- Manual text input and transcript editing
- Real-time speech recognition support when available
- Text normalization and punctuation cleanup
- Sentiment analysis with a donut chart and dominant emotion result
- ASL sign sequence animation with play, pause, and restart controls
- Audio waveform and spectral analysis from the recorded clip
- Graceful empty, loading, and error states for browser permission and API failures

## Tech stack

- React 18 + Create React App
- Tailwind CSS
- Framer Motion
- Recharts
- Lucide React
- Axios
- Browser Web Speech and MediaRecorder APIs
- Google Gemini via a secure proxy route

## Workflow

1. User records speech or types a sentence.
2. Browser speech recognition captures the transcript.
3. Text is normalized and cleaned before display.
4. An AI proxy evaluates sentiment and formatting.
5. The ASL animator walks through the sign sequence one letter at a time.
6. Audio analysis visualizes the recorded waveform and spectrum when supported.

This workflow follows the implementation details and Result Analysis discussion in `speech_to_sign_language_report.pdf`, especially pages 13-15: audio capture, speech-to-text conversion, text cleaning, sentiment analysis, and animated ASL generation from the text-image dataset.

## Installation

```bash
npm install
cp .env.example .env
```

## Environment variables

Create a local `.env` file before running the app:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
PORT=3001
```

## Local development

Run the frontend:

```bash
npm start
```

Run the local proxy server:

```bash
npm run start:api
```

The frontend calls `/api/gemini` and the server keeps the API key on the backend instead of exposing it to the browser.

Run both commands in separate terminals during local development.

## Production build

```bash
npm run build
```

This generates a production bundle in `build/`.

## Deployment

This app is compatible with a static frontend deployment pattern and a serverless API route. For Vercel, configure the environment variable `GEMINI_API_KEY` in the project dashboard and keep the Gemini call on the server side.

## Browser requirements

This app depends on modern browser features such as:

- SpeechRecognition / webkitSpeechRecognition
- MediaRecorder
- Web Audio API
- microphone permissions

## Known limitations

- Speech recognition accuracy depends on device, browser, and environment noise.
- ASL rendering is limited to the available dataset and letter-based mappings.
- Sentiment output is only as reliable as the source text and the model response.
- Audio analysis is best-effort and may vary by device hardware and browser support.

## Notes

Never expose a private Gemini API key in browser code or commit a real `.env` file to version control.
