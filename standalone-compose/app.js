(() => {
  const state = {
    stage: document.getElementById('stage'),
    status: document.getElementById('status'),
    bgImage: null,
    bgNaturalWidth: 0,
    bgNaturalHeight: 0,
    items: [],
    selectedId: null,
    drag: null,
    nextId: 1,
  };

  const el = {
    bgFile: document.getElementById('bg-file'),
    itemUrl: document.getElementById('item-url'),
    btnAddUrl: document.getElementById('btn-add-url'),
    itemFiles: document.getElementById('item-files'),
    autoRemoveWhite: document.getElementById('auto-remove-white'),
    whiteThreshold: document.getElementById('white-threshold'),
    valWhiteThreshold: document.getElementById('val-white-threshold'),
    selected: document.getElementById('selected-item'),
    btnDeselect: document.getElementById('btn-deselect'),
    btnPreview: document.getElementById('btn-preview'),
    scale: document.getElementById('scale'),
    rotation: document.getElementById('rotation'),
    opacity: document.getElementById('opacity'),
    valScale: document.getElementById('val-scale'),
    valRotation: document.getElementById('val-rotation'),
    valOpacity: document.getElementById('val-opacity'),
    btnMoveUp: document.getElementById('btn-move-up'),
    btnMoveDown: document.getElementById('btn-move-down'),
    btnFront: document.getElementById('btn-front'),
    btnBack: document.getElementById('btn-back'),
    btnRemove: document.getElementById('btn-remove'),
    btnRemoveWhiteSelected: document.getElementById('btn-remove-white-selected'),
    btnExport: document.getElementById('btn-export'),
    btnJson: document.getElementById('btn-json'),
    toasts: document.getElementById('toasts'),
    previewOverlay: document.getElementById('preview-overlay'),
    previewImage: document.getElementById('preview-image'),
  };

  function toast(msg, type = 'info') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = msg;
    el.toasts.appendChild(node);
    setTimeout(() => node.remove(), 3500);
  }

  function setStatus(msg) {
    state.status.textContent = msg;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function stageRect() {
    return state.stage.getBoundingClientRect();
  }

  function toStagePoint(clientX, clientY) {
    const rect = stageRect();
    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  }

  function readableName(name) {
    if (!name) return 'item';
    return name.replace(/\.[a-z0-9]+$/i, '').trim() || 'item';
  }

  function nextZ() {
    if (!state.items.length) return 1;
    return Math.max(...state.items.map((i) => i.z)) + 1;
  }

  function normalizeZOrder() {
    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((item, index) => {
        item.z = index + 1;
      });
  }

  function selectedItem() {
    return state.items.find((i) => i.id === state.selectedId) || null;
  }

  function deriveBaseSize(img) {
    const rect = stageRect();
    const maxW = Math.max(120, rect.width * 0.25);
    const naturalW = img.naturalWidth || 400;
    const naturalH = img.naturalHeight || 300;
    const ratio = naturalH / naturalW;
    const width = Math.min(maxW, naturalW);
    return { width, height: width * ratio };
  }

  function renderSelectedOptions() {
    el.selected.innerHTML = '';

    if (!state.items.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No items yet';
      el.selected.appendChild(option);
      el.selected.disabled = true;
      return;
    }

    el.selected.disabled = false;
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'None';
    el.selected.appendChild(emptyOption);

    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.label} (#${item.id})`;
        el.selected.appendChild(option);
      });

    if (state.selectedId) {
      el.selected.value = state.selectedId;
    } else {
      el.selected.value = '';
    }
  }

  function syncControls() {
    const item = selectedItem();
    const has = !!item;

    el.scale.disabled = !has;
    el.rotation.disabled = !has;
    el.opacity.disabled = !has;
    el.btnFront.disabled = !has;
    el.btnBack.disabled = !has;
    el.btnMoveUp.disabled = !has;
    el.btnMoveDown.disabled = !has;
    el.btnRemove.disabled = !has;
    el.btnDeselect.disabled = !has;
    el.btnPreview.disabled = !has;

    if (!item) {
      el.valScale.textContent = '1.00';
      el.valRotation.textContent = '0deg';
      el.valOpacity.textContent = '1.00';
      return;
    }

    el.scale.value = String(item.scale);
    el.rotation.value = String(item.rotation);
    el.opacity.value = String(item.opacity);
    el.valScale.textContent = item.scale.toFixed(2);
    el.valRotation.textContent = `${Math.round(item.rotation)}deg`;
    el.valOpacity.textContent = item.opacity.toFixed(2);
  }

  function applyItemStyles(node, item) {
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.baseWidth}px`;
    node.style.height = `${item.baseHeight}px`;
    node.style.opacity = String(item.opacity);
    node.style.transform = `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`;
    node.style.zIndex = String(item.z);
  }

  function selectItem(id) {
    state.selectedId = id;
    renderScene();
    renderSelectedOptions();
    syncControls();
  }

  function deselectItem() {
    state.selectedId = null;
    renderScene();
    renderSelectedOptions();
    syncControls();
    setStatus('Selection cleared.');
  }

  function showPreview() {
    const item = selectedItem();
    if (!item) {
      toast('Select an item first.', 'error');
      return;
    }
    el.previewImage.src = item.img.src;
    el.previewOverlay.hidden = false;
  }

  function hidePreview() {
    if (el.previewOverlay.hidden) return;
    el.previewOverlay.hidden = true;
    el.previewImage.removeAttribute('src');
  }

  function renderScene() {
    state.stage.innerHTML = '';

    if (state.bgImage) {
      const bg = document.createElement('img');
      bg.src = state.bgImage.src;
      bg.alt = 'Background';
      bg.className = 'stage-bg';
      state.stage.appendChild(bg);
    } else {
      const empty = document.createElement('div');
      empty.className = 'stage-empty';
      empty.textContent = 'Add a room image to begin.';
      state.stage.appendChild(empty);
    }

    state.items
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((item) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `stage-item${item.id === state.selectedId ? ' selected' : ''}`;
        node.setAttribute('aria-label', item.label);
        applyItemStyles(node, item);

        const image = document.createElement('img');
        image.src = item.img.src;
        image.alt = item.label;
        image.draggable = false;
        node.appendChild(image);

        node.addEventListener('pointerdown', (ev) => {
          const point = toStagePoint(ev.clientX, ev.clientY);
          selectItem(item.id);
          state.drag = {
            id: item.id,
            dx: point.x - item.x,
            dy: point.y - item.y,
          };
          node.setPointerCapture(ev.pointerId);
          ev.preventDefault();
        });

        node.addEventListener('pointermove', (ev) => {
          if (!state.drag || state.drag.id !== item.id) return;
          const point = toStagePoint(ev.clientX, ev.clientY);
          item.x = point.x - state.drag.dx;
          item.y = point.y - state.drag.dy;
          applyItemStyles(node, item);
        });

        node.addEventListener('pointerup', () => {
          state.drag = null;
        });

        node.addEventListener('pointercancel', () => {
          state.drag = null;
        });

        node.addEventListener('click', () => selectItem(item.id));
        state.stage.appendChild(node);
      });
  }

  function imageFromSrc(src, withCors = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (withCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to load image source.'));
      img.src = src;
    });
  }

  async function imageFromFile(file) {
    const src = URL.createObjectURL(file);
    return imageFromSrc(src, false);
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
    if (!el.autoRemoveWhite.checked) return img;
    const threshold = parseInt(el.whiteThreshold.value, 10);
    return removeNearWhiteBackground(img, threshold);
  }

  async function setBackgroundFromFile(file) {
    const img = await imageFromFile(file);
    state.bgImage = img;
    state.bgNaturalWidth = img.naturalWidth || 0;
    state.bgNaturalHeight = img.naturalHeight || 0;
    renderScene();
    setStatus('Background loaded.');
  }

  async function addItemFromImage(img, label) {
    const rect = stageRect();
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
    setStatus(`Added ${label}.`);
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
      toast('Select an item first.', 'error');
      return;
    }
    const threshold = parseInt(el.whiteThreshold.value, 10);
    item.img = await removeNearWhiteBackground(item.img, threshold);
    renderScene();
    setStatus('Applied white background removal to selected item.');
    toast('Selected item cleaned.', 'success');
  }

  function updateFromControls() {
    const item = selectedItem();
    if (!item) return;

    item.scale = parseFloat(el.scale.value);
    item.rotation = parseFloat(el.rotation.value);
    item.opacity = parseFloat(el.opacity.value);

    el.valScale.textContent = item.scale.toFixed(2);
    el.valRotation.textContent = `${Math.round(item.rotation)}deg`;
    el.valOpacity.textContent = item.opacity.toFixed(2);

    renderScene();
  }

  function exportSize() {
    if (state.bgNaturalWidth > 0 && state.bgNaturalHeight > 0) {
      return { width: state.bgNaturalWidth, height: state.bgNaturalHeight };
    }
    const rect = stageRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  async function renderExportBlob() {
    if (!state.bgImage) {
      throw new Error('Set a background image before exporting.');
    }

    const rect = stageRect();
    const output = exportSize();
    const scaleX = output.width / rect.width;
    const scaleY = output.height / rect.height;

    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(state.bgImage, 0, 0, output.width, output.height);

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

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Export failed. CORS may block remote URLs.'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  }

  function downloadBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  function buildLayoutJson() {
    return {
      created_at: new Date().toISOString(),
      background: {
        width: state.bgNaturalWidth,
        height: state.bgNaturalHeight,
      },
      items: state.items.map((item) => ({
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

  function removeSelected() {
    if (!state.selectedId) return;
    state.items = state.items.filter((i) => i.id !== state.selectedId);
    state.selectedId = state.items[0]?.id || null;
    renderScene();
    renderSelectedOptions();
    syncControls();
    setStatus('Selected item removed.');
  }

  function moveSelected(delta) {
    const item = selectedItem();
    if (!item) return;
    const ordered = state.items.slice().sort((a, b) => a.z - b.z);
    const index = ordered.findIndex((entry) => entry.id === item.id);
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
    syncControls();
  }

  function bringSelectedToFront() {
    const item = selectedItem();
    if (!item) return;
    item.z = nextZ();
    normalizeZOrder();
    renderScene();
    renderSelectedOptions();
    syncControls();
    setStatus('Moved selected item to front.');
  }

  function pushSelectedToBottom() {
    const item = selectedItem();
    if (!item) return;
    item.z = 0;
    normalizeZOrder();
    renderScene();
    renderSelectedOptions();
    syncControls();
    setStatus('Moved selected item to bottom.');
  }

  function bindEvents() {
    el.bgFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await setBackgroundFromFile(file);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    el.btnAddUrl.addEventListener('click', async () => {
      const url = el.itemUrl.value.trim();
      if (!url) {
        toast('Enter an item image URL first.', 'error');
        return;
      }
      try {
        await addItemFromUrl(url);
        el.itemUrl.value = '';
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    el.itemFiles.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          await addItemFromFile(file);
        } catch (err) {
          toast(`${file.name}: ${err.message}`, 'error');
        }
      }
      e.target.value = '';
    });

    el.selected.addEventListener('change', (e) => {
      if (!e.target.value) {
        deselectItem();
        return;
      }
      selectItem(e.target.value);
    });

    el.btnDeselect.addEventListener('click', deselectItem);
    el.btnPreview.addEventListener('click', showPreview);

    el.scale.addEventListener('input', updateFromControls);
    el.rotation.addEventListener('input', updateFromControls);
    el.opacity.addEventListener('input', updateFromControls);

    el.btnMoveUp.addEventListener('click', () => moveSelected(1));
    el.btnMoveDown.addEventListener('click', () => moveSelected(-1));
    el.btnRemove.addEventListener('click', removeSelected);
    el.btnFront.addEventListener('click', bringSelectedToFront);
    el.btnBack.addEventListener('click', pushSelectedToBottom);
    el.btnRemoveWhiteSelected.addEventListener('click', async () => {
      try {
        await removeWhiteFromSelected();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    el.whiteThreshold.addEventListener('input', () => {
      el.valWhiteThreshold.textContent = el.whiteThreshold.value;
    });

    el.btnExport.addEventListener('click', async () => {
      try {
        const blob = await renderExportBlob();
        const filename = `scene_${Date.now()}.png`;
        downloadBlob(blob, filename);
        setStatus(`Exported ${filename}`);
        toast('Scene exported as PNG.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    el.btnJson.addEventListener('click', () => {
      const json = buildLayoutJson();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `scene_layout_${Date.now()}.json`);
      setStatus('Layout JSON downloaded.');
      toast('Layout saved.', 'success');
    });

    el.previewOverlay.addEventListener('click', hidePreview);

    window.addEventListener('resize', () => renderScene());
    window.addEventListener('keydown', (event) => {
      if (!el.previewOverlay.hidden) {
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

  bindEvents();
  hidePreview();
  renderSelectedOptions();
  syncControls();
  renderScene();
})();
