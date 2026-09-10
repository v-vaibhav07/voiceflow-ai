/**
 * Audio utility functions
 */

function bufferToBase64(buffer) {
  if (Buffer.isBuffer(buffer)) return buffer.toString('base64');
  if (buffer instanceof ArrayBuffer) return Buffer.from(buffer).toString('base64');
  if (buffer instanceof Uint8Array) return Buffer.from(buffer).toString('base64');
  throw new Error('Unsupported buffer type');
}

function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}

function estimateAudioDurationMs(byteLength, format, sampleRate = 22050) {
  if (format === 'mp3') return Math.round((byteLength / 4000) * 1000);
  if (format === 'wav') {
    const bytesPerSecond = sampleRate * 2;
    return Math.round((byteLength / bytesPerSecond) * 1000);
  }
  if (format === 'pcm') {
    const bytesPerSecond = sampleRate * 2;
    return Math.round((byteLength / bytesPerSecond) * 1000);
  }
  return Math.round((byteLength / 4000) * 1000);
}

function getMimeType(format) {
  const map = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pcm: 'audio/pcm',
    mulaw: 'audio/x-mulaw',
  };
  return map[format] || 'audio/mpeg';
}

function chunkBuffer(buffer, chunkSize = 16384) {
  const chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = { bufferToBase64, base64ToBuffer, estimateAudioDurationMs, getMimeType, chunkBuffer };