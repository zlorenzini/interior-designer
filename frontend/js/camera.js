/**
 * camera.js — WebRTC UVC camera capture
 *
 * Exports a global `Camera` object consumed by app.js.
 * Supports device selection so users can pick from multiple UVC cameras.
 */

const Camera = (() => {
  let _stream = null;
  let _videoEl = null;
  let _canvasEl = null;

  /**
   * Enumerate video input devices and return [{deviceId, label}].
   * Requires at least one permission grant before labels are populated.
   */
  async function getDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 6)}` }));
  }

  /**
   * Start camera stream.
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} canvasEl
   * @param {string|null} deviceId  — null = browser default
   */
  async function start(videoEl, canvasEl, deviceId = null) {
    _videoEl = videoEl;
    _canvasEl = canvasEl;

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false,
    };

    _stream = await navigator.mediaDevices.getUserMedia(constraints);
    _videoEl.srcObject = _stream;
    await _videoEl.play();
    return _stream;
  }

  /** Stop all camera tracks. */
  function stop() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_videoEl) {
      _videoEl.srcObject = null;
    }
  }

  /**
   * Capture a single frame as a Blob (image/jpeg).
   * @param {number} quality — JPEG quality 0–1
   * @returns {Promise<Blob>}
   */
  async function captureFrame(quality = 0.92) {
    if (!_videoEl || !_canvasEl) throw new Error('Camera not started.');
    const { videoWidth, videoHeight } = _videoEl;
    _canvasEl.width = videoWidth;
    _canvasEl.height = videoHeight;
    const ctx = _canvasEl.getContext('2d');
    ctx.drawImage(_videoEl, 0, 0, videoWidth, videoHeight);
    return new Promise((resolve, reject) => {
      _canvasEl.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed.'));
      }, 'image/jpeg', quality);
    });
  }

  /** True if a stream is currently active. */
  function isActive() { return _stream !== null; }

  return { start, stop, captureFrame, getDevices, isActive };
})();
