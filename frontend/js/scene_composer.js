/**
 * scene_composer.js - Build synthetic training scenes by placing item images over a room photo.
 */

window.SceneComposer = (() => {
  const state = {
    stage: null,
    bgImage: null,
    bgNaturalWidth: 0,
    bgNaturalHeight: 0,
    items: [],
    selectedId: null,
    drag: null,
    nextId: 1,
    deps: { API: null, toast: null, setStatus: null },
    lastExportBlob: null,
  };

  const ids = {
    stage: 'compose-stage',
    bgFile: 'compose-bg-file',
    bgId: 'compose-bg-id',
    btnLoadBgId: 'btn-compose-load-bg-id',
    itemUrl: 'compose-item-url',
    btnAddUrl: 'btn-compose-add-url',
    itemFile: 'compose-item-file',
    autoRemoveWhite: 'compose-auto-remove-white',
    whiteThreshold: 'compose-white-threshold',
    whiteThresholdVal: 'compose-white-threshold-val',
    selected: 'compose-selected',
    btnDeselect: 'btn-compose-deselect',
    btnPreview: 'btn-compose-preview',
    scale: 'compose-scale',
    scaleVal: 'compose-scale-val',
    rotation: 'compose-rotation',
    rotVal: 'compose-rot-val',
    opacity: 'compose-opacity',
    opacityVal: 'compose-opacity-val',
    btnMoveUp: 'btn-compose-move-up',
    btnMoveDown: 'btn-compose-move-down',
    btnFront: 'btn-compose-front',
    btnBack: 'btn-compose-back',
    btnRemove: 'btn-compose-remove',
    btnRemoveWhiteSelected: 'btn-compose-remove-white-selected',
    btnExport: 'btn-compose-export',
    btnUpload: 'btn-compose-upload',
    btnJson: 'btn-compose-json',
    previewOverlay: 'compose-preview-overlay',
    previewImage: 'compose-preview-image',
    status: 'compose-status',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setLocalStatus(msg) {
    state.deps.setStatus(ids.status, msg);
  }

  function getStageRect() {
    return state.stage.getBoundingClientRect();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function toStagePoint(clientX, clientY) {
    const rect = getStageRect();
    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  }

  function readableName(name) {
    if (!name) return 'item';
    return name.replace(/\.[a-z0-9]+$/i, '').trim() || 'item';
  }

  function deriveBaseSize(img) {
    const rect = getStageRect();
    const maxW = Math.max(120, rect.width * 0.25);
    const naturalW = img.naturalWidth || 400;
    const naturalH = img.naturalHeight || 300;
    const ratio = naturalH / naturalW;
    const width = Math.min(maxW, naturalW);
    const height = width * ratio;
    return { width, height };
  }

  function nextZ() {
    if (!state.items.length) return 1;
    return Math.max(...state.items.map(i => i.z)) + 1;
  }

  function normalizeZOrder() {
    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((item, index) => {
        item.z = index + 1;
      });
  }

  function selectItem(id) {
    state.selectedId = id;
    renderScene();
    syncSelectedControls();
    renderSelectedOptions();
  }

  function deselectItem() {
    state.selectedId = null;
    renderScene();
    syncSelectedControls();
    renderSelectedOptions();
    setLocalStatus('Selection cleared.');
  }

  function showPreview() {
    const item = selectedItem();
    if (!item) {
      state.deps.toast('Select an item first.', 'error');
      return;
    }
    $(ids.previewImage).src = item.img.src;
    $(ids.previewOverlay).hidden = false;
  }

  function hidePreview() {
    const overlay = $(ids.previewOverlay);
    if (overlay.hidden) return;
    overlay.hidden = true;
    $(ids.previewImage).removeAttribute('src');
  }

  function removeSelected() {
    if (!state.selectedId) return;
    state.items = state.items.filter(i => i.id !== state.selectedId);
    state.selectedId = state.items[0]?.id || null;
    renderScene();
    renderSelectedOptions();
    syncSelectedControls();
    setLocalStatus('Selected item removed.');
  }

  function bringSelectedToFront() {
    const item = state.items.find(i => i.id === state.selectedId);
    if (!item) return;
    item.z = nextZ();
    normalizeZOrder();
    renderScene();
    renderSelectedOptions();
    syncSelectedControls();
    setLocalStatus('Moved selected item to front.');
  }

  function moveSelected(delta) {
    const item = selectedItem();
    if (!item) return;
    const ordered = state.items.slice().sort((a, b) => a.z - b.z);
    const index = ordered.findIndex(entry => entry.id === item.id);
    if (index < 0) return;
    const targetIndex = clamp(index + delta, 0, ordered.length - 1);
    if (targetIndex === index) return;
    const other = ordered[targetIndex];
    const currentZ = item.z;
    item.z = other.z;
    other.z = currentZ;
    normalizeZOrder();
    renderScene();
    renderSelectedOptions();
    syncSelectedControls();
    setLocalStatus(delta > 0 ? 'Moved selected item up.' : 'Moved selected item down.');
  }

  function pushSelectedToBottom() {
    const item = selectedItem();
    if (!item) return;
    item.z = 0;
    normalizeZOrder();
    renderScene();
    renderSelectedOptions();
    syncSelectedControls();
    setLocalStatus('Moved selected item to bottom.');
  }

  function selectedItem() {
    return state.items.find(i => i.id === state.selectedId) || null;
  }

  function syncSelectedControls() {
    const item = selectedItem();
    const hasItem = !!item;

    $(ids.scale).disabled = !hasItem;
    $(ids.rotation).disabled = !hasItem;
    $(ids.opacity).disabled = !hasItem;
    $(ids.btnMoveUp).disabled = !hasItem;
    $(ids.btnMoveDown).disabled = !hasItem;
    $(ids.btnFront).disabled = !hasItem;
    $(ids.btnBack).disabled = !hasItem;
    $(ids.btnRemove).disabled = !hasItem;
    $(ids.btnDeselect).disabled = !hasItem;
    $(ids.btnPreview).disabled = !hasItem;

    if (!item) {
      $(ids.scaleVal).textContent = '1.00';
      $(ids.rotVal).textContent = '0°';
      $(ids.opacityVal).textContent = '1.00';
      return;
    }

    $(ids.scale).value = String(item.scale);
    $(ids.rotation).value = String(item.rotation);
    $(ids.opacity).value = String(item.opacity);

    $(ids.scaleVal).textContent = item.scale.toFixed(2);
    $(ids.rotVal).textContent = `${Math.round(item.rotation)}°`;
    $(ids.opacityVal).textContent = item.opacity.toFixed(2);
  }

  function renderSelectedOptions() {
    const select = $(ids.selected);
    select.innerHTML = '';

    if (!state.items.length) {
      const option = document.createElement('option');
      option.textContent = 'No items yet';
      option.value = '';
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    const emptyOption = document.createElement('option');
    emptyOption.textContent = 'None';
    emptyOption.value = '';
    select.appendChild(emptyOption);

    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.label} (#${item.id})`;
        select.appendChild(option);
      });

    select.disabled = false;
    if (state.selectedId) {
      select.value = state.selectedId;
    } else {
      select.value = '';
    }
  }

  function renderScene() {
    state.stage.innerHTML = '';

    if (state.bgImage) {
      const bg = document.createElement('img');
      bg.className = 'compose-stage__bg';
      bg.src = state.bgImage.src;
      bg.alt = 'Scene background';
      state.stage.appendChild(bg);
    } else {
      const empty = document.createElement('div');
      empty.className = 'compose-stage__empty';
      empty.textContent = 'Set a room background to start composing.';
      state.stage.appendChild(empty);
    }

    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach(item => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'compose-item';
        if (item.id === state.selectedId) el.classList.add('compose-item--selected');

        applyItemStyles(el, item);
        el.setAttribute('aria-label', item.label);

        const img = document.createElement('img');
        img.src = item.img.src;
        img.alt = item.label;
        img.draggable = false;
        el.appendChild(img);

        el.addEventListener('pointerdown', (ev) => {
          const point = toStagePoint(ev.clientX, ev.clientY);
          selectItem(item.id);
          state.drag = {
            id: item.id,
            dx: point.x - item.x,
            dy: point.y - item.y,
          };
          el.setPointerCapture(ev.pointerId);
          ev.preventDefault();
        });

        el.addEventListener('pointermove', (ev) => {
          if (!state.drag || state.drag.id !== item.id) return;
          const point = toStagePoint(ev.clientX, ev.clientY);
          item.x = point.x - state.drag.dx;
          item.y = point.y - state.drag.dy;
          applyItemStyles(el, item);
        });

        el.addEventListener('pointerup', () => {
          state.drag = null;
        });

        el.addEventListener('pointercancel', () => {
          state.drag = null;
        });

        el.addEventListener('click', () => {
          selectItem(item.id);
        });

        state.stage.appendChild(el);
      });
  }

  function applyItemStyles(el, item) {
    el.style.left = `${item.x}px`;
    el.style.top = `${item.y}px`;
    el.style.width = `${item.baseWidth}px`;
    el.style.height = `${item.baseHeight}px`;
    el.style.opacity = String(item.opacity);
    el.style.transform = `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`;
    el.style.zIndex = String(item.z);
  }

  async function imageFromFile(file) {
    const src = URL.createObjectURL(file);
    const img = await imageFromSrc(src, false);
    return img;
  }

  function imageFromSrc(src, withCors = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (withCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to load image source'));
      img.src = src;
    });
  }

  async function setBackgroundFromImage(img) {
    state.bgImage = img;
    state.bgNaturalWidth = img.naturalWidth || 0;
    state.bgNaturalHeight = img.naturalHeight || 0;
    renderScene();
    setLocalStatus('Background image loaded.');
  }

  async function removeNearWhiteBackground(img, threshold = 245, softness = 20) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    const minBlend = Math.max(0, threshold - softness);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const minChannel = Math.min(r, g, b);

      if (minChannel >= threshold) {
        data[i + 3] = 0;
      } else if (minChannel >= minBlend) {
        const keep = (threshold - minChannel) / (threshold - minBlend || 1);
        data[i + 3] = Math.round(a * keep);
      }
    }

    ctx.putImageData(frame, 0, 0);
    return imageFromSrc(canvas.toDataURL('image/png'), false);
  }

  async function maybeCleanWhiteBackground(img) {
    const autoEl = $(ids.autoRemoveWhite);
    if (!autoEl || !autoEl.checked) return img;
    const threshold = parseInt($(ids.whiteThreshold).value, 10);
    return removeNearWhiteBackground(img, threshold);
  }

  async function setBackgroundFromFile(file) {
    const img = await imageFromFile(file);
    await setBackgroundFromImage(img);
  }

  async function setBackgroundFromImageId(imageId) {
    if (!state.deps.API) throw new Error('API module not available.');
    const url = state.deps.API.imageUrl(imageId);
    const img = await imageFromSrc(url, true);
    await setBackgroundFromImage(img);
  }

  async function addItemFromImage(img, label = 'item') {
    const rect = getStageRect();
    const base = deriveBaseSize(img);
    const id = `item-${state.nextId++}`;

    state.items.push({
      id,
      label,
      img,
      x: rect.width / 2,
      y: rect.height / 2,
      baseWidth: base.width,
      baseHeight: base.height,
      scale: 1,
      rotation: 0,
      opacity: 1,
      z: nextZ(),
    });

    selectItem(id);
    renderSelectedOptions();
    syncSelectedControls();
    setLocalStatus(`Added: ${label}`);
  }

  async function addItemFromFile(file) {
    let img = await imageFromFile(file);
    img = await maybeCleanWhiteBackground(img);
    await addItemFromImage(img, readableName(file.name));
  }

  async function addItemFromUrl(url) {
    let img = await imageFromSrc(url, true);
    img = await maybeCleanWhiteBackground(img);
    const pathname = url.split('?')[0];
    const name = pathname.split('/').pop() || 'web-item';
    await addItemFromImage(img, readableName(name));
  }

  async function removeWhiteFromSelected() {
    const item = selectedItem();
    if (!item) {
      state.deps.toast('Select an item first.', 'error');
      return;
    }
    const threshold = parseInt($(ids.whiteThreshold).value, 10);
    item.img = await removeNearWhiteBackground(item.img, threshold);
    renderScene();
    setLocalStatus('Applied white background removal to selected item.');
    state.deps.toast('Selected item cleaned.', 'success');
  }

  function updateSelectedFromControls() {
    const item = selectedItem();
    if (!item) return;

    item.scale = parseFloat($(ids.scale).value);
    item.rotation = parseFloat($(ids.rotation).value);
    item.opacity = parseFloat($(ids.opacity).value);

    $(ids.scaleVal).textContent = item.scale.toFixed(2);
    $(ids.rotVal).textContent = `${Math.round(item.rotation)}°`;
    $(ids.opacityVal).textContent = item.opacity.toFixed(2);

    renderScene();
  }

  function exportSize() {
    if (state.bgNaturalWidth > 0 && state.bgNaturalHeight > 0) {
      return { width: state.bgNaturalWidth, height: state.bgNaturalHeight };
    }
    const rect = getStageRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  async function renderExportBlob() {
    if (!state.bgImage) {
      throw new Error('Set a background image before exporting.');
    }

    const stageRect = getStageRect();
    const out = exportSize();
    const scaleX = out.width / stageRect.width;
    const scaleY = out.height / stageRect.height;

    const canvas = document.createElement('canvas');
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(state.bgImage, 0, 0, out.width, out.height);

    const ordered = state.items.slice().sort((a, b) => a.z - b.z);
    for (const item of ordered) {
      const cx = item.x * scaleX;
      const cy = item.y * scaleY;
      const dw = item.baseWidth * item.scale * scaleX;
      const dh = item.baseHeight * item.scale * scaleY;

      ctx.save();
      ctx.globalAlpha = item.opacity;
      ctx.translate(cx, cy);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.drawImage(item.img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('Export failed. If items come from external sites, CORS may block export.'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });

    state.lastExportBlob = blob;
    return blob;
  }

  function buildLayoutJson() {
    return {
      created_at: new Date().toISOString(),
      background: {
        width: state.bgNaturalWidth,
        height: state.bgNaturalHeight,
      },
      items: state.items.map(item => ({
        id: item.id,
        label: item.label,
        x: Number(item.x.toFixed(2)),
        y: Number(item.y.toFixed(2)),
        scale: item.scale,
        rotation: item.rotation,
        opacity: item.opacity,
        z: item.z,
      })),
    };
  }

  function downloadBlob(blob, fileName) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  async function onExport() {
    const blob = await renderExportBlob();
    const fileName = `scene_${Date.now()}.png`;
    downloadBlob(blob, fileName);
    setLocalStatus(`Exported ${fileName}`);
    state.deps.toast('Scene exported as PNG.', 'success');
  }

  async function onUpload() {
    if (!state.deps.API) {
      throw new Error('API module not available.');
    }

    const blob = state.lastExportBlob || await renderExportBlob();
    const file = new File([blob], `scene_${Date.now()}.png`, { type: 'image/png' });
    const result = await state.deps.API.uploadImage(file);
    setLocalStatus(`Uploaded composite as ${result.image_id}`);
    state.deps.toast(`Uploaded training image: ${result.image_id}`, 'success');
  }

  function onDownloadJson() {
    const json = buildLayoutJson();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `scene_layout_${Date.now()}.json`);
    setLocalStatus('Downloaded layout JSON.');
  }

  function bindEvents() {
    $(ids.bgFile).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await setBackgroundFromFile(file);
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.btnLoadBgId).addEventListener('click', async () => {
      const imageId = $(ids.bgId).value.trim();
      if (!imageId) {
        state.deps.toast('Enter an image ID first.', 'error');
        return;
      }
      try {
        await setBackgroundFromImageId(imageId);
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.btnAddUrl).addEventListener('click', async () => {
      const url = $(ids.itemUrl).value.trim();
      if (!url) {
        state.deps.toast('Enter an item image URL first.', 'error');
        return;
      }
      try {
        await addItemFromUrl(url);
        $(ids.itemUrl).value = '';
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.itemFile).addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const file of files) {
        try {
          await addItemFromFile(file);
        } catch (err) {
          state.deps.toast(`${file.name}: ${err.message}`, 'error');
        }
      }
      e.target.value = '';
    });

    $(ids.selected).addEventListener('change', (e) => {
      if (!e.target.value) {
        deselectItem();
        return;
      }
      selectItem(e.target.value);
    });

    $(ids.btnDeselect).addEventListener('click', deselectItem);
    $(ids.btnPreview).addEventListener('click', showPreview);

    $(ids.scale).addEventListener('input', updateSelectedFromControls);
    $(ids.rotation).addEventListener('input', updateSelectedFromControls);
    $(ids.opacity).addEventListener('input', updateSelectedFromControls);

    $(ids.btnMoveUp).addEventListener('click', () => moveSelected(1));
    $(ids.btnMoveDown).addEventListener('click', () => moveSelected(-1));
    $(ids.btnFront).addEventListener('click', bringSelectedToFront);
    $(ids.btnBack).addEventListener('click', pushSelectedToBottom);
    $(ids.btnRemove).addEventListener('click', removeSelected);
    $(ids.btnRemoveWhiteSelected).addEventListener('click', async () => {
      try {
        await removeWhiteFromSelected();
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.whiteThreshold).addEventListener('input', () => {
      $(ids.whiteThresholdVal).textContent = $(ids.whiteThreshold).value;
    });

    $(ids.btnExport).addEventListener('click', async () => {
      try {
        await onExport();
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.btnUpload).addEventListener('click', async () => {
      try {
        await onUpload();
      } catch (err) {
        state.deps.toast(err.message, 'error');
      }
    });

    $(ids.btnJson).addEventListener('click', onDownloadJson);
    $(ids.previewOverlay).addEventListener('click', hidePreview);

    window.addEventListener('resize', () => {
      renderScene();
    });

    window.addEventListener('keydown', (event) => {
      if (!$(ids.previewOverlay).hidden) {
        event.preventDefault();
        hidePreview();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        deselectItem();
      }
    });
  }

  function init({ API, toast, setStatus }) {
    state.stage = $(ids.stage);
    if (!state.stage) return;

    state.deps = { API, toast, setStatus };

    bindEvents();
    renderSelectedOptions();
    syncSelectedControls();
    renderScene();
  }

  return { init };
})();
