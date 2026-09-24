import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

let recognitionInstance;

class MockSpeechRecognition {
  constructor() {
    recognitionInstance = this;
    this.start = jest.fn(() => {
      this.started = true;
      this.onstart?.();
    });
    this.stop = jest.fn(() => {
      this.started = false;
      this.onend?.();
    });
  }
}
  let recorderInstance;
  let recorderHasData = true;
  let resolveTranscription;

  class MockMediaRecorder {
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
      recorderInstance = this;
    }

    static isTypeSupported() {
      return true;
    }

    start = jest.fn(() => {
      this.state = 'recording';
    });

    stop = jest.fn(() => {
      this.state = 'inactive';
      if (recorderHasData) {
        this.ondataavailable?.({ data: new Blob(['audio-data'], { type: this.mimeType }) });
      }
      Promise.resolve().then(() => this.onstop?.());
    });
  }

  const createStream = () => {
    const track = {
      label: 'Test microphone',
      readyState: 'live',
      enabled: true,
      getSettings: () => ({ deviceId: 'test-device' }),
      stop: jest.fn(() => { track.readyState = 'ended'; })
    };
    return { getAudioTracks: () => [track], getTracks: () => [track], track };
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    global.MediaRecorder = MockMediaRecorder;
    recorderHasData = true;
    const stream = createStream();
    navigator.mediaDevices = { getUserMedia: jest.fn().mockResolvedValue(stream) };
    global.fetch = jest.fn(async (url, request) => {
      if (url === '/api/transcribe') {
        if (resolveTranscription) {
          await new Promise((resolve) => { resolveTranscription = resolve; });
        }
        const audio = request.body.get('audio');
        expect(audio.size).toBeGreaterThan(0);
        return { ok: true, json: async () => ({ text: 'Hello my name is Dhanashri' }) };
      }

      const body = JSON.parse(request.body);
      if (body.action === 'normalize') return { ok: true, json: async () => ({ text: body.text }) };
      return {
        ok: true,
        json: async () => ({ sentiment: { positiveScore: 20, neutralScore: 70, negativeScore: 10, dominantEmotion: 'neutral' } })
      };
    });
  });

  afterEach(() => {
    delete global.MediaRecorder;
    delete navigator.mediaDevices;
    jest.restoreAllMocks();
  });

  test('does not require SpeechRecognition for audio transcription', async () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));

    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  test('finalizes the Blob, uploads FormData, and sends the returned transcript through processing', async () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /listening/i }));

    await waitFor(() => expect(screen.getByLabelText('Transcript')).toHaveValue('Hello My Name Is Dhanashri'));
    expect(global.fetch.mock.calls.some(([url]) => url === '/api/transcribe')).toBe(true);
    expect(screen.getByText('HELLO')).toBeInTheDocument();
    expect(recorderInstance.stop).toHaveBeenCalledTimes(1);
  });

  test('rejects an empty recording without uploading it', async () => {
    recorderHasData = false;
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /listening/i }));

    expect(await screen.findByText('No audio was captured. Please try speaking again.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/transcribe', expect.anything());
  });

  test('reports backend transcription errors without exposing provider details', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url === '/api/transcribe') return { ok: false, status: 502, json: async () => ({ error: 'Speech transcription failed. Please try again.' }) };
      return { ok: true, json: async () => ({ text: 'unused' }) };
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /listening/i }));

    expect(await screen.findByText('Speech transcription service is unavailable. Make sure the backend is running.')).toBeInTheDocument();
  });

  test('does not stop microphone tracks until transcription has completed', async () => {
    let releaseTranscription;
    global.fetch.mockImplementation(async (url) => {
      if (url === '/api/transcribe') {
        await new Promise((resolve) => { releaseTranscription = resolve; });
        return { ok: true, json: async () => ({ text: 'Hello' }) };
      }
      const body = JSON.parse(arguments[1]?.body || '{}');
      return { ok: true, json: async () => (body.action === 'sentiment' ? { sentiment: { positiveScore: 20, neutralScore: 70, negativeScore: 10, dominantEmotion: 'neutral' } } : { text: 'Hello' }) };
    });

    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalled());
    const stream = await navigator.mediaDevices.getUserMedia.mock.results[0].value;
    fireEvent.click(screen.getByRole('button', { name: /listening/i }));
    await waitFor(() => expect(releaseTranscription).toBeDefined());
    expect(stream.track.stop).not.toHaveBeenCalled();
    releaseTranscription();
    await waitFor(() => expect(stream.track.stop).toHaveBeenCalled());
  });

  test('cleans up tracks after transcription failure', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url === '/api/transcribe') return { ok: false, status: 500, json: async () => ({ error: 'failed' }) };
      return { ok: true, json: async () => ({ text: 'unused' }) };
    });
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
    await waitFor(() => expect(recorderInstance.start).toHaveBeenCalled());
    const stream = await navigator.mediaDevices.getUserMedia.mock.results[0].value;
    fireEvent.click(screen.getByRole('button', { name: /listening/i }));

    await waitFor(() => expect(stream.track.stop).toHaveBeenCalled());
  });

const createStream = () => {
  const track = {
    label: 'Test microphone',
    readyState: 'live',
    enabled: true,
    getSettings: () => ({ deviceId: 'test-device' }),
    stop: jest.fn()
  };
  return { getAudioTracks: () => [track], getTracks: () => [track], track };
};

const emitResults = (results, resultIndex = 0) => {
  recognitionInstance.onresult({ resultIndex, results });
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.SpeechRecognition = MockSpeechRecognition;
  delete window.webkitSpeechRecognition;
  const stream = createStream();
  navigator.mediaDevices = { getUserMedia: jest.fn().mockResolvedValue(stream) };
  global.fetch = jest.fn(async (_url, request) => {
    const body = JSON.parse(request.body);
    if (body.action === 'normalize') return { ok: true, json: async () => ({ text: body.text }) };
    return {
      ok: true,
      json: async () => ({ sentiment: { positiveScore: 20, neutralScore: 70, negativeScore: 10, dominantEmotion: 'neutral' } })
    };
  });
});

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  delete navigator.mediaDevices;
  jest.restoreAllMocks();
});

test('reports unavailable speech recognition without crashing', async () => {
  delete window.SpeechRecognition;
  render(<Dashboard />);

  expect(await screen.findByText('Browser speech recognition is unavailable in this environment.')).toBeInTheDocument();
});

test('starts listening, accumulates final and interim text, then sends one transcript through processing', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));

  await waitFor(() => expect(recognitionInstance.start).toHaveBeenCalledTimes(1));
  act(() => {
    emitResults([{ 0: { transcript: 'Hello' }, isFinal: true }]);
    emitResults([{ 0: { transcript: 'my name' }, isFinal: false }]);
  });
  expect(screen.getByLabelText('Transcript')).toHaveValue('Hello my name');

  act(() => emitResults([{ 0: { transcript: 'my name is Dhanashri' }, isFinal: true }]));
  expect(screen.getByLabelText('Transcript')).toHaveValue('Hello my name is Dhanashri');

  fireEvent.click(screen.getByRole('button', { name: /listening/i }));

  await waitFor(() => expect(screen.getByText('HELLO')).toBeInTheDocument());
  const normalizeRequest = global.fetch.mock.calls.find(([, request]) => JSON.parse(request.body).action === 'normalize');
  expect(JSON.parse(normalizeRequest[1].body).text).toBe('Hello My Name Is Dhanashri');
  expect(recognitionInstance.stop).toHaveBeenCalledTimes(1);
});

test('maps microphone permission denial to a clear message', async () => {
  navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' }));
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));

  expect(await screen.findByText('Microphone access was denied. Allow microphone access for localhost and try again.')).toBeInTheDocument();
});

test('maps no-speech and audio-capture recognition errors', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
  await waitFor(() => expect(recognitionInstance.start).toHaveBeenCalled());

  act(() => recognitionInstance.onerror({ error: 'no-speech' }));
  expect(screen.getByText('No speech detected. Please try speaking again.')).toBeInTheDocument();
  act(() => recognitionInstance.onerror({ error: 'audio-capture' }));
  expect(screen.getByText('Microphone audio could not be captured. Check your microphone and Windows microphone permissions.')).toBeInTheDocument();
});

test('restarts natural recognition end while listening but not after stop', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
  await waitFor(() => expect(recognitionInstance.start).toHaveBeenCalledTimes(1));

  recognitionInstance.onend();
  expect(recognitionInstance.start).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: /listening/i }));
  expect(recognitionInstance.stop).toHaveBeenCalledTimes(1);
});

test('stops the stream and recognition on unmount', async () => {
  const { unmount } = render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: /start speaking/i }));
  await waitFor(() => expect(recognitionInstance.start).toHaveBeenCalled());
  const stream = await navigator.mediaDevices.getUserMedia.mock.results[0].value;
  unmount();

  expect(recognitionInstance.stop).toHaveBeenCalled();
  expect((await stream).track.stop).toHaveBeenCalled();
});
