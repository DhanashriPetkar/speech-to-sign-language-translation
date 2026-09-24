import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AudioLines, BrainCircuit, Download, Loader2, Mic, RefreshCcw, Sparkles, Square, Wand2 } from 'lucide-react';
import { Cell, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SignLanguageAnimator from './SignLanguageAnimator';
import SignSequence from './SignSequence';
import AvatarPlaceholder from './AvatarPlaceholder';
import useSignLanguageImages from './useSignLanguageImages';
import { transcribeAudioBlob } from '../services/audioService';
import { analyzeSentimentWithFallback, processTextWithFallback } from '../services/textService';
import { translateTextToSigns } from '../services/translationService';

const DEFAULT_STATUS = 'idle';

const logDevelopment = (...messages) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...messages);
  }
};

const getMicrophoneErrorMessage = (error) => {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Microphone access was denied. Allow microphone access for localhost and try again.';
  }
  if (error?.name === 'NotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.';
  }
  return error?.message || 'Microphone permission denied or unavailable.';
};

const Dashboard = () => {
  const [textInput, setTextInput] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzingSentiment] = useState(false);
  const speechSupported = typeof MediaRecorder !== 'undefined';
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [sentimentData, setSentimentData] = useState(null);
  const [showSignLanguage, setShowSignLanguage] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const microphoneSourceRef = useRef(null);
  const microphoneAnalyserRef = useRef(null);
  const microphoneLevelTimerRef = useRef(null);
  const microphoneSignalReportedRef = useRef(false);
  const microphoneNoSignalReportedRef = useRef(false);
  const audioChunksRef = useRef([]);
  const signAssets = useSignLanguageImages();
  const translation = useMemo(
    () => translateTextToSigns(processedText || textInput, signAssets.images),
    [processedText, textInput, signAssets.images]
  );

  const stopMicrophoneDiagnostics = useCallback(() => {
    if (microphoneLevelTimerRef.current) {
      window.clearInterval(microphoneLevelTimerRef.current);
      microphoneLevelTimerRef.current = null;
    }
    if (microphoneSourceRef.current) {
      microphoneSourceRef.current.disconnect();
      microphoneSourceRef.current = null;
    }
    if (microphoneAnalyserRef.current) {
      microphoneAnalyserRef.current.disconnect();
      microphoneAnalyserRef.current = null;
    }
  }, []);

  const startMicrophoneDiagnostics = (stream) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || !stream) return;

    try {
      if (audioContext.state === 'suspended') audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      microphoneSourceRef.current = source;
      microphoneAnalyserRef.current = analyser;
      microphoneSignalReportedRef.current = false;
      microphoneNoSignalReportedRef.current = false;
      const samples = new Uint8Array(analyser.fftSize);
      let silentChecks = 0;

      microphoneLevelTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => {
          const normalized = (sample - 128) / 128;
          return sum + normalized * normalized;
        }, 0) / samples.length);
        if (rms > 0.02 && !microphoneSignalReportedRef.current) {
          microphoneSignalReportedRef.current = true;
          logDevelopment('[AUDIO] microphone signal detected');
        }
        if (rms <= 0.02) silentChecks += 1;
        if (silentChecks >= 8 && !microphoneSignalReportedRef.current && !microphoneNoSignalReportedRef.current) {
          microphoneNoSignalReportedRef.current = true;
          logDevelopment('[AUDIO] microphone stream contains no detectable audio');
        }
      }, 250);
    } catch (diagnosticError) {
      logDevelopment('[AUDIO ERROR]', diagnosticError);
    }
  };

  const cleanupRecordingStream = useCallback(() => {
    stopMicrophoneDiagnostics();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [stopMicrophoneDiagnostics]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass();
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (recorderError) {
          logDevelopment('[AUDIO ERROR]', recorderError);
        }
      }
      cleanupRecordingStream();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [cleanupRecordingStream]);

  useEffect(() => () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  }, [audioUrl]);

  const handleProcessText = async (value) => {
    if (!value || !value.trim()) {
      setError('Please provide text before processing.');
      return;
    }

    setIsProcessing(true);
    setStatus('processing');
    setError('');
    logDevelopment('[ASL] translating:', value);

    try {
      const normalizedResult = await processTextWithFallback(value);
      const outputText = normalizedResult.text || value.trim();
      setProcessedText(outputText);
      setTextInput(outputText);
      setShowSignLanguage(true);

      const sentimentResult = await analyzeSentimentWithFallback(outputText);
      setSentimentData(sentimentResult);
      setStatus('results');
      logDevelopment('[ASL] signs:', translateTextToSigns(outputText, signAssets.images).signs);
    } catch (err) {
      setError('Unable to process the text right now. Please try again.');
      setStatus(DEFAULT_STATUS);
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzeAudio = async (audioBlob) => {
    if (!audioContextRef.current) {
      setError('Audio analysis is unavailable in this browser.');
      return;
    }

    try {
      const audioContext = audioContextRef.current;
      const arrayBuffer = await audioBlob.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.4;

      const source = audioContext.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const amplitudePoints = [];
      const channelData = decodedBuffer.getChannelData(0);
      const chunkSize = Math.max(1, Math.floor(channelData.length / 100));

      for (let index = 0; index < 100; index += 1) {
        const chunk = channelData.slice(index * chunkSize, (index + 1) * chunkSize);
        const amplitude = chunk.length ? Math.max(...chunk.map((point) => Math.abs(point))) : 0;
        amplitudePoints.push({ time: Number(((index / 100) * decodedBuffer.duration).toFixed(2)), value: Number(amplitude.toFixed(4)) });
      }

      analyser.getByteFrequencyData(frequencyData);
      const sampleRate = decodedBuffer.sampleRate;
      const frequencyPoints = Array.from(frequencyData)
        .map((magnitude, index) => ({
          hz: Math.round((index * sampleRate) / analyser.fftSize),
          magnitude: Number(magnitude)
        }))
        .filter((point) => point.magnitude > 0)
        .filter((_, index) => index % 5 === 0);

      const spectrumData = new Float32Array(analyser.fftSize);
      analyser.getFloatFrequencyData(spectrumData);
      let magnitudeTotal = 0;
      let weightedFrequency = 0;
      for (let index = 0; index < spectrumData.length; index += 1) {
        const magnitude = Math.pow(10, spectrumData[index] / 20);
        const frequency = (index * sampleRate) / analyser.fftSize;
        weightedFrequency += magnitude * frequency;
        magnitudeTotal += magnitude;
      }

      const spectralCentroid = magnitudeTotal ? weightedFrequency / magnitudeTotal : 0;
      const spectrumBandwidth = frequencyPoints.length
        ? frequencyPoints.reduce((accumulator, current) => accumulator + current.magnitude, 0) / frequencyPoints.length
        : 0;

      setAudioFeatures({
        frequency: frequencyPoints,
        amplitude: amplitudePoints,
        spectral: [{ centroid: spectralCentroid, bandwidth: spectrumBandwidth }]
      });

      source.start(0);
      window.setTimeout(() => {
        source.stop();
        source.disconnect();
        analyser.disconnect();
      }, Math.max(250, decodedBuffer.duration * 1000));
    } catch (audioError) {
      setError('Audio analysis failed. Please try another recording.');
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone access is not supported in this browser.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('Audio recording is unavailable in this browser.');
      return;
    }

    setError('');
    setStatus('idle');
    setIsRecording(true);
    setAudioFeatures(null);
    setAudioUrl('');

    try {
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' });
          logDevelopment('[AUDIO] microphone permission:', permission.state);
          if (permission.state === 'denied') {
            throw new Error('Microphone access was denied. Allow microphone access for localhost and try again.');
          }
        } catch (permissionError) {
          if (permissionError.message.includes('Microphone access was denied')) throw permissionError;
          logDevelopment('[AUDIO] microphone permission query unavailable');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const audioTracks = stream.getAudioTracks();
      logDevelopment('[AUDIO] getUserMedia success');
      logDevelopment('[AUDIO] tracks:', audioTracks.length);
      audioTracks.forEach((track) => logDevelopment('[AUDIO] track state:', {
        label: track.label,
        readyState: track.readyState,
        enabled: track.enabled,
        deviceId: track.getSettings?.().deviceId
      }));

      if (!audioTracks.length || audioTracks.some((track) => track.readyState !== 'live' || track.enabled !== true)) {
        throw new Error('Microphone returned no live audio track. Check your Windows microphone settings.');
      }
      startMicrophoneDiagnostics(stream);
      const supportedMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          logDevelopment('[AUDIO] audio chunk received', event.data.size);
        }
      };
      recorder.onstop = async () => {
        logDevelopment('[AUDIO] recording stopped');
        const collectedChunks = [...audioChunksRef.current];
        if (!collectedChunks.length) {
          logDevelopment('[AUDIO ERROR] Empty recording blob');
          setError('No audio was captured. Please try speaking again.');
          setStatus(DEFAULT_STATUS);
          setIsRecording(false);
          cleanupRecordingStream();
          return;
        }

        const blob = new Blob(collectedChunks, { type: recorder.mimeType || 'audio/webm' });
        logDevelopment('[AUDIO] blob created', blob.size, blob.type);
        if (!blob.size) {
          logDevelopment('[AUDIO ERROR] Empty recording blob');
          setError('No audio was captured. Please try speaking again.');
          setStatus(DEFAULT_STATUS);
          setIsRecording(false);
          cleanupRecordingStream();
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        setAudioUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });

        try {
          await analyzeAudio(blob);
          logDevelopment('[STT] sending audio to backend');
          const transcript = await transcribeAudioBlob(blob);
          logDevelopment('[STT] transcript received');
          logDevelopment('[STT] final transcript:', transcript);
          await handleProcessText(transcript);
        } catch (transcriptionError) {
          logDevelopment('[STT ERROR]', transcriptionError);
          setError(transcriptionError.message || 'Speech transcription failed. Please try again.');
          setStatus(DEFAULT_STATUS);
        } finally {
          cleanupRecordingStream();
          mediaRecorderRef.current = null;
          setIsRecording(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      logDevelopment('[AUDIO] recording started');
      setStatus('recording');
    } catch (micError) {
      logDevelopment('[AUDIO ERROR]', micError);
      setError(getMicrophoneErrorMessage(micError));
      setStatus(DEFAULT_STATUS);
      setIsRecording(false);
      cleanupRecordingStream();
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      } catch (recorderError) {
        logDevelopment('[AUDIO ERROR]', recorderError);
      }
    }

    setIsRecording(false);
    setStatus('processing');
  };

  const clearText = () => {
    setTextInput('');
    setProcessedText('');
    setSentimentData(null);
    setAudioFeatures(null);
    setShowSignLanguage(false);
    setError('');
    setStatus(DEFAULT_STATUS);
  };

  const label = status === 'recording' ? 'Recording' : status === 'listening' ? 'Listening' : status === 'processing' ? 'Processing' : status === 'results' ? 'Results ready' : 'Idle';

  return (
    <div className="dashboard-shell">
      <div className="page-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Accessibility workspace</p>
            <h1>Speech-to-sign translation</h1>
            <p className="topbar-description">Turn spoken or typed English into a clear, reviewable ASL fingerspelling sequence.</p>
          </div>
          <div className={`status-pill status-${status}`}>
            <span className="status-dot" />
            {label}
          </div>
        </header>

        <div className="content-grid">
          <section className="panel primary-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Input</p>
                <h2>Speech / Text Capture</h2>
              </div>
              <button type="button" className="secondary-button" onClick={clearText}>
                <RefreshCcw size={16} />
                Clear
              </button>
            </div>

            {error && (
              <div className="error-banner">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <label htmlFor="transcript" className="field-label">Transcript</label>
            <textarea
              id="transcript"
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              placeholder="Speak or type your sentence here..."
              rows={6}
            />

            <div className="action-row">
              {!isRecording ? (
                <button type="button" className="primary-button" onClick={startRecording} disabled={isProcessing}>
                  <Mic size={18} />
                  {isProcessing ? 'Processing...' : 'Start Speaking'}
                </button>
              ) : (
                <button type="button" className="danger-button" onClick={stopRecording}>
                  <Square size={18} />
                  Listening...
                </button>
              )}

              <button type="button" className="ghost-button" onClick={() => handleProcessText(textInput)} disabled={!textInput.trim() || isProcessing}>
                {isProcessing ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
                Process Text
              </button>
            </div>

            <div className="meta-grid">
              <div className="meta-card">
                <span className="meta-label">Speech support</span>
                <strong>{speechSupported ? 'Available' : 'Unavailable'}</strong>
              </div>
              <div className="meta-card">
                <span className="meta-label">Recording</span>
                <strong>{isRecording ? 'Live' : 'Standby'}</strong>
              </div>
            </div>

            <div className="detected-inline" aria-live="polite">
              <span>Detected text</span>
              <strong>{processedText || textInput || 'Waiting for speech or typed text'}</strong>
            </div>

            {audioUrl && (
              <div className="audio-panel">
                <audio controls src={audioUrl} className="audio-player" />
                <a href={audioUrl} download="speech-recording.wav" className="download-button">
                  <Download size={16} />
                  Download audio
                </a>
              </div>
            )}
          </section>

          <aside className="panel side-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">English text</p>
                <h2>Detected text</h2>
              </div>
            </div>

            <div className="processed-box" aria-live="polite">
              {processedText || textInput || 'No text yet. Record or type a sentence to begin.'}
            </div>

            <div className="mini-stats">
              <div className="stat-card">
                <Sparkles size={18} />
                <div>
                  <span>Language</span>
                  <strong>ASL flow</strong>
                </div>
              </div>
              <div className="stat-card">
                <BrainCircuit size={18} />
                <div>
                  <span>Sentiment</span>
                  <strong>{sentimentData?.status === 'unavailable' ? 'Unavailable' : sentimentData ? sentimentData.dominantEmotion : 'Pending'}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {isAnalyzingSentiment && (
          <section className="panel subtle-panel">
            <div className="inline-loading"><Loader2 className="spin" size={18} />Analyzing sentiment...</div>
          </section>
        )}

        {sentimentData && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Sentiment</p>
                <h2>Emotion analysis</h2>
              </div>
            </div>

            <div className="sentiment-grid">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={sentimentData.chartData || []} dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={2} nameKey="name">
                      {(sentimentData.chartData || []).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="sentiment-summary">
                <div className={`summary-badge sentiment-${sentimentData.status === 'unavailable' ? 'unavailable' : (sentimentData.dominantEmotion || 'neutral').toLowerCase()}`}>
                  <span>Dominant emotion</span>
                  <strong>{sentimentData.status === 'unavailable' ? 'Unavailable' : sentimentData.dominantEmotion}</strong>
                </div>
                {sentimentData.status !== 'unavailable' && (sentimentData.chartData || []).map((item) => (
                  <div key={item.name} className="legend-row">
                    <span className="legend-dot" style={{ background: item.color }} />
                    <span>{item.name}</span>
                    <strong>{Math.round(item.value)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {(showSignLanguage || processedText) && (
          <section className="panel">
            <div className="translation-grid">
              <SignSequence signSequence={translation.signs} />
              <SignLanguageAnimator
                text={processedText || textInput}
                signSequence={translation.signs}
                images={signAssets.images}
                loading={signAssets.loading}
                error={signAssets.error}
                speed={1}
              />
            </div>
            <AvatarPlaceholder />
          </section>
        )}

        {audioFeatures && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Audio</p>
                <h2>Frequency and waveform analysis</h2>
              </div>
            </div>

            <div className="chart-grid">
              <div className="chart-card">
                <h3>Frequency spectrum</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={audioFeatures.frequency}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hz" tickFormatter={(value) => `${value}`} />
                    <YAxis domain={[0, 255]} />
                    <Tooltip labelFormatter={(value) => `${value} Hz`} />
                    <Line type="monotone" dataKey="magnitude" stroke="#4f46e5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h3>Amplitude over time</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={audioFeatures.amplitude}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tickFormatter={(value) => `${value}s`} />
                    <YAxis domain={[0, 1]} />
                    <Tooltip labelFormatter={(value) => `${value}s`} />
                    <Line type="monotone" dataKey="value" stroke="#10b981" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="feature-metrics">
              <div className="metric-card">
                <AudioLines size={18} />
                <div>
                  <span>Spectral centroid</span>
                  <strong>{audioFeatures.spectral[0]?.centroid?.toFixed(1) || '0.0'} Hz</strong>
                </div>
              </div>
              <div className="metric-card">
                <AudioLines size={18} />
                <div>
                  <span>Bandwidth</span>
                  <strong>{audioFeatures.spectral[0]?.bandwidth?.toFixed(1) || '0.0'} Hz</strong>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Dashboard;