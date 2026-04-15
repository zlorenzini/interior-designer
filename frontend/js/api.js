/**
 * api.js — Backend API client
 * All calls go through this module so the base URL is configured in one place.
 */

const API = (() => {
  const BASE = (window.APP_CONFIG?.apiBase) || 'http://localhost:8000/api';

  async function _request(method, path, body = null, isJson = true) {
    const opts = {
      method,
      headers: isJson && body ? { 'Content-Type': 'application/json' } : {},
    };
    if (body) {
      opts.body = isJson ? JSON.stringify(body) : body; // FormData or JSON
    }

    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch (_) {}
      throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ── Images ────────────────────────────────────────────────────────────────

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    return _request('POST', '/images/upload', fd, false);
  }

  async function listImages() {
    return _request('GET', '/images/');
  }

  function imageUrl(imageId) {
    return `${BASE}/images/${encodeURIComponent(imageId)}`;
  }

  async function deleteImage(imageId) {
    return _request('DELETE', `/images/${encodeURIComponent(imageId)}`);
  }

  // ── Inference ─────────────────────────────────────────────────────────────

  async function generateDesign({ imageId, style, prompt, strength, fineTunedModel }) {
    return _request('POST', '/inference/generate', {
      image_id: imageId,
      style,
      prompt: prompt || undefined,
      strength,
      fine_tuned_model: fineTunedModel || undefined,
    });
  }

  // ── Training ──────────────────────────────────────────────────────────────

  async function startTraining({ imageIds, styleName, epochs, learningRate }) {
    return _request('POST', '/training/start', {
      image_ids: imageIds,
      style_name: styleName,
      epochs,
      learning_rate: learningRate,
    });
  }

  async function listJobs() {
    return _request('GET', '/training/');
  }

  async function getJob(jobId) {
    return _request('GET', `/training/${encodeURIComponent(jobId)}`);
  }

  async function deleteJob(jobId) {
    return _request('DELETE', `/training/${encodeURIComponent(jobId)}`);
  }

  return { uploadImage, listImages, imageUrl, deleteImage, generateDesign, startTraining, listJobs, getJob, deleteJob };
})();
