export async function transcribeAudioBlob(blob) {
  if (!blob || !blob.size) {
    throw new Error('No audio was captured. Please try speaking again.');
  }

  const formData = new FormData();
  formData.append('audio', blob, 'speech-recording');

  let response;
  try {
    response = await fetch('http://localhost:3001/api/transcribe', {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    throw new Error('Speech transcription service is unavailable. Make sure the backend is running.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('Speech transcription failed. Please try again.');
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('Audio recording is too large. Please record a shorter clip.');
    }
    if (response.status === 422) {
      throw new Error('No speech was detected in the recording.');
    }
    if (response.status >= 500) {
      throw new Error('Speech transcription service is unavailable. Make sure the backend is running.');
    }
    throw new Error(data.error || 'Speech transcription failed. Please try again.');
  }

  const transcript = data.transcript;
  if (typeof transcript !== 'string' || !transcript.trim()) {
    throw new Error('No speech was detected in the recording.');
  }

  return transcript.trim();
}
