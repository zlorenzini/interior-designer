/**
 * app.js — Main application logic & navigation
 *
 * Depends on: api.js, camera.js, google_drive.js (loaded before this script)
 */

// ── Config ──────────────────────────────────────────────────────────────────
window.APP_CONFIG = Object.assign({
  apiBase: 'http://localhost:8000/api',
  // googleClientId: '',
  // googleApiKey: '',
  // googleAppId: '',
}, window.APP_CONFIG || {});

// ── Utils ────────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setStatus(elId, msg) {
  const el = document.getElementById(elId);
  if (el) el.textContent = msg;
}

// ── Navigation ───────────────────────────────────────────────────────────────

let sceneComposerInitialized = false;

function ensureSceneComposer() {
  if (sceneComposerInitialized || !window.SceneComposer) return;
  window.SceneComposer.init({ API, toast, setStatus });
  sceneComposerInitialized = true;
}

document.getElementById('main-nav').addEventListener('click', e => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const viewId = `view-${btn.dataset.view}`;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  // Trigger lazy loads
  if (btn.dataset.view === 'compose') ensureSceneComposer();
  if (btn.dataset.view === 'gallery') loadGallery();
  if (btn.dataset.view === 'training') loadJobs();
});

// ── Camera view ──────────────────────────────────────────────────────────────

const videoEl  = document.getElementById('camera-video');
const canvasEl = document.getElementById('camera-canvas');
const overlay  = document.getElementById('camera-status');
const btnStart = document.getElementById('btn-start-camera');
const btnSnap  = document.getElementById('btn-snap');
const btnStop  = document.getElementById('btn-stop-camera');
const deviceSelect = document.getElementById('camera-device-select');
const deviceWrap   = document.getElementById('camera-device-select-wrap');

btnStart.addEventListener('click', async () => {
  try {
    await Camera.start(videoEl, canvasEl, deviceSelect.value || null);
    overlay.classList.add('hidden');
    btnSnap.disabled = false;
    btnStop.disabled = false;
    btnStart.disabled = true;

    // Populate device list after first permission grant
    const devices = await Camera.getDevices();
    deviceSelect.innerHTML = devices.map(d =>
      `<option value="${d.deviceId}">${d.label}</option>`
    ).join('');
    deviceWrap.hidden = devices.length < 2;
  } catch (err) {
    toast(`Camera error: ${err.message}`, 'error');
  }
});

btnStop.addEventListener('click', () => {
  Camera.stop();
  overlay.textContent = 'Camera stopped';
  overlay.classList.remove('hidden');
  btnSnap.disabled = true;
  btnStop.disabled = true;
  btnStart.disabled = false;
});

btnSnap.addEventListener('click', async () => {
  try {
    btnSnap.disabled = true;
    const blob = await Camera.captureFrame();
    const file = new File([blob], `snap_${Date.now()}.jpg`, { type: 'image/jpeg' });
    const result = await API.uploadImage(file);
    toast(`Snapshot uploaded: ${result.image_id}`, 'success');
  } catch (err) {
    toast(`Snap failed: ${err.message}`, 'error');
  } finally {
    btnSnap.disabled = false;
  }
});

deviceSelect.addEventListener('change', async () => {
  if (Camera.isActive()) {
    Camera.stop();
    await Camera.start(videoEl, canvasEl, deviceSelect.value);
  }
});

// ── Upload / drop zone ────────────────────────────────────────────────────────

const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const uploadBtn   = document.getElementById('btn-upload');
const uploadPreview = document.getElementById('upload-preview');
let pendingFile = null;

function setPendingFile(file) {
  pendingFile = file;
  uploadBtn.disabled = false;
  const url = URL.createObjectURL(file);
  uploadPreview.src = url;
  uploadPreview.hidden = false;
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setPendingFile(fileInput.files[0]);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setPendingFile(file);
});

uploadBtn.addEventListener('click', async () => {
  if (!pendingFile) return;
  setStatus('upload-status', 'Uploading…');
  uploadBtn.disabled = true;
  try {
    const result = await API.uploadImage(pendingFile);
    setStatus('upload-status', `Uploaded: ${result.image_id}`);
    toast('Image uploaded successfully.', 'success');
    pendingFile = null;
    uploadPreview.hidden = true;
  } catch (err) {
    setStatus('upload-status', `Error: ${err.message}`);
    toast(err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
  }
});

// ── Google Drive pick ─────────────────────────────────────────────────────────

document.getElementById('btn-drive-pick').addEventListener('click', async () => {
  try {
    const picked = await GDrive.pickFile();
    if (!picked) return;
    setStatus('upload-status', `Importing from Drive: ${picked.name}…`);
    const result = await GDrive.importFileViaBackend(picked.id);
    setStatus('upload-status', `Imported: ${result.image_id}`);
    toast('Imported from Google Drive.', 'success');
  } catch (err) {
    setStatus('upload-status', '');
    toast(`Drive error: ${err.message}`, 'error');
  }
});

// ── Gallery view ──────────────────────────────────────────────────────────────

async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '<p class="placeholder">Loading…</p>';
  try {
    const images = await API.listImages();
    if (!images.length) {
      grid.innerHTML = '<p class="placeholder">No images uploaded yet.</p>';
      return;
    }
    grid.innerHTML = '';
    images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        <img src="${API.imageUrl(img.image_id)}" alt="${img.image_id}" loading="lazy" />
        <div class="gallery-item__id" title="${img.image_id}">${img.image_id}</div>
        <div class="gallery-item__actions">
          <button class="btn btn--primary btn--use" data-id="${img.image_id}">Use</button>
          <button class="btn btn--danger btn--del" data-id="${img.image_id}">Del</button>
        </div>`;
      grid.appendChild(item);
    });

    // Use → pre-fill generate form
    grid.querySelectorAll('.btn--use').forEach(b => {
      b.addEventListener('click', () => {
        document.getElementById('gen-image-id').value = b.dataset.id;
        document.querySelector('[data-view="generate"]').click();
      });
    });

    // Delete
    grid.querySelectorAll('.btn--del').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm(`Delete ${b.dataset.id}?`)) return;
        await API.deleteImage(b.dataset.id);
        loadGallery();
      });
    });
  } catch (err) {
    grid.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
    toast(err.message, 'error');
  }
}

document.getElementById('btn-refresh-gallery').addEventListener('click', loadGallery);

// ── Generate view ─────────────────────────────────────────────────────────────

const strengthRange = document.getElementById('gen-strength');
strengthRange.addEventListener('input', () => {
  document.getElementById('gen-strength-val').textContent = strengthRange.value;
});

document.getElementById('btn-generate').addEventListener('click', async () => {
  const imageId = document.getElementById('gen-image-id').value.trim();
  if (!imageId) { toast('Enter an image ID first.', 'error'); return; }

  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  setStatus('gen-status', 'Generating… this may take a minute.');

  try {
    const data = await API.generateDesign({
      imageId,
      style: document.getElementById('gen-style').value,
      prompt: document.getElementById('gen-prompt').value.trim() || null,
      strength: parseFloat(strengthRange.value),
      fineTunedModel: document.getElementById('gen-fine-tuned').value.trim() || null,
    });

    const container = document.getElementById('result-container');
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = data.base64_image;
    container.appendChild(img);

    // Enable download
    const dlBtn = document.getElementById('btn-download-result');
    dlBtn.href = data.base64_image;

    document.getElementById('result-actions').hidden = false;
    setStatus('gen-status', `Done! Result ID: ${data.result_image_id}`);
    toast('Generation complete.', 'success');

    // Save-to-drive button
    document.getElementById('btn-save-drive').dataset.resultId = data.result_image_id;
  } catch (err) {
    setStatus('gen-status', `Error: ${err.message}`);
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-save-drive').addEventListener('click', async (e) => {
  const resultId = e.currentTarget.dataset.resultId;
  if (!resultId) return;
  try {
    toast('Saving to Google Drive…');
    await GDrive.importFileViaBackend(resultId); // reuse proxy endpoint concept
    toast('Saved to Google Drive.', 'success');
  } catch (err) {
    toast(`Drive save failed: ${err.message}`, 'error');
  }
});

// ── Training view ─────────────────────────────────────────────────────────────

document.getElementById('train-epochs').addEventListener('input', e => {
  document.getElementById('train-epochs-val').textContent = e.target.value;
});

document.getElementById('btn-start-training').addEventListener('click', async () => {
  const styleName = document.getElementById('train-style').value.trim();
  const rawIds    = document.getElementById('train-image-ids').value.trim();

  if (!styleName) { toast('Enter a style name.', 'error'); return; }
  if (!rawIds)    { toast('Enter at least one image ID.', 'error'); return; }

  const imageIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const job = await API.startTraining({
      imageIds,
      styleName,
      epochs:       parseInt(document.getElementById('train-epochs').value, 10),
      learningRate: parseFloat(document.getElementById('train-lr').value),
    });
    setStatus('train-status-text', `Job started: ${job.job_id}`);
    toast('Training job queued.', 'success');
    loadJobs();
  } catch (err) {
    setStatus('train-status-text', `Error: ${err.message}`);
    toast(err.message, 'error');
  }
});

document.getElementById('btn-refresh-jobs').addEventListener('click', loadJobs);

async function loadJobs() {
  const list = document.getElementById('job-list');
  try {
    const jobs = await API.listJobs();
    if (!jobs.length) {
      list.innerHTML = '<p class="placeholder">No training jobs yet.</p>';
      return;
    }
    list.innerHTML = '';
    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'job-card';
      const pct = Math.round(job.progress * 100);
      card.innerHTML = `
        <div class="job-card__header">
          <span class="job-card__name">${job.job_id.slice(0, 8)}…</span>
          <span class="job-badge job-badge--${job.status}">${job.status}</span>
        </div>
        <progress class="job-progress" max="1" value="${job.progress}"></progress>
        <small>${job.message || `${pct}%`}</small>
        <div class="actions">
          <button class="btn btn--danger btn--del-job" data-id="${job.job_id}">Remove</button>
        </div>`;
      list.appendChild(card);
    });

    list.querySelectorAll('.btn--del-job').forEach(b => {
      b.addEventListener('click', async () => {
        await API.deleteJob(b.dataset.id);
        loadJobs();
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="placeholder">Error: ${err.message}</p>`;
  }
}
