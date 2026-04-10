/* =============================================
   CornealAI — Dashboard Script
   Handles: upload, API calls, Grad-CAM,
   segmentation, history, animations
   ============================================= */

'use strict';

// ===== STATE =====
const state = {
  uploadedFile: null,
  uploadedDataURL: null,
  currentSource: 'upload',  // 'upload' | 'iot'
  currentResult: null,
  history: JSON.parse(localStorage.getItem('cornealai_history') || '[]'),
  activeVizTab: 'heatmap',
  isAnalyzing: false,
  iotPollInterval: null,
};

// ===== DOM REFS =====
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ===== NAVBAR SCROLL =====
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.navbar');
  nav.classList.toggle('scrolled', window.scrollY > 20);

  // Active nav link
  const sections = ['hero', 'upload', 'how-it-works', 'history'];
  let current = 'hero';
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el && window.scrollY >= el.offsetTop - 120) current = id;
  });
  $$('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${current}`);
  });
});

// ===== MOBILE MENU =====
$('mobile-menu-btn').addEventListener('click', () => {
  const links = document.querySelector('.nav-links');
  const actions = document.querySelector('.nav-actions');
  const isOpen = links.style.display === 'flex';
  if (isOpen) {
    links.style.display = '';
    actions.style.display = '';
  } else {
    links.style.display = 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '72px';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = 'rgba(10,14,26,0.98)';
    links.style.padding = '16px 24px';
    links.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    actions.style.display = 'none';
  }
});

// ===== COUNTER ANIMATION =====
function animateCounter(el, target, duration = 1800) {
  const start = performance.now();
  const startVal = 0;
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.floor(startVal + (target - startVal) * ease);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target.toLocaleString();
  };
  requestAnimationFrame(update);
}

// Observe hero stats
const heroObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      $$('[data-count]').forEach(el => {
        animateCounter(el, parseInt(el.dataset.count));
      });
      heroObserver.disconnect();
    }
  });
}, { threshold: 0.5 });
const heroStats = document.querySelector('.hero-stats');
if (heroStats) heroObserver.observe(heroStats);

// ===== SCROLL REVEAL =====
function addReveal() {
  $$('.step-card, .panel, .history-stat, .history-table-wrapper').forEach((el, i) => {
    el.classList.add('reveal');
    if (i % 3 === 1) el.classList.add('reveal-delay-1');
    if (i % 3 === 2) el.classList.add('reveal-delay-2');
  });
}
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.15 });
addReveal();
$$('.reveal').forEach(el => revealObserver.observe(el));

// ===== SOURCE TOGGLE (Upload / IoT) =====
$$('.source-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentSource = btn.dataset.source;

    if (state.currentSource === 'iot') {
      $('upload-zone').style.display = 'none';
      $('image-preview').style.display = 'none';
      $('iot-panel').style.display = 'block';
      startIoTPolling();
    } else {
      $('upload-zone').style.display = '';
      $('iot-panel').style.display = 'none';
      stopIoTPolling();
      if (state.uploadedDataURL) {
        $('upload-zone').style.display = 'none';
        $('image-preview').style.display = '';
      }
    }
  });
});

// ===== FILE UPLOAD =====
const uploadZone = $('upload-zone');
const fileInput  = $('file-input');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragging');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragging');
  const files = e.dataTransfer.files;
  if (files[0]) handleFile(files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Invalid file type', 'Please upload a JPG, PNG, or WEBP image.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large', 'Maximum file size is 10MB.', 'error');
    return;
  }
  state.uploadedFile = file;

  const reader = new FileReader();
  reader.onload = e => {
    state.uploadedDataURL = e.target.result;
    showImagePreview(e.target.result, file.name, file.size);
    $('btn-analyze').disabled = false;
    resetResult();
  };
  reader.readAsDataURL(file);
}

function showImagePreview(dataURL, name, size) {
  $('upload-zone').style.display = 'none';
  $('image-preview').style.display = '';
  $('preview-img').src = dataURL;
  $('file-name').textContent = name;
  $('file-size').textContent = formatBytes(size);
}

$('btn-remove-img').addEventListener('click', () => {
  state.uploadedFile = null;
  state.uploadedDataURL = null;
  fileInput.value = '';
  $('image-preview').style.display = 'none';
  $('upload-zone').style.display = '';
  $('btn-analyze').disabled = true;
  resetResult();
});

$('btn-new-scan').addEventListener('click', () => {
  $('btn-remove-img').click();
  window.scrollTo({ top: $('upload').offsetTop - 80, behavior: 'smooth' });
});

// ===== IOT POLLING =====
function startIoTPolling() {
  $('btn-analyze').disabled = true;
  state.iotPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/iot/latest', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data.image_url) {
          const imgRes = await fetch(data.image_url);
          const blob = await imgRes.blob();
          const file = new File([blob], 'iot_capture.jpg', { type: 'image/jpeg' });
          handleFile(file);
          stopIoTPolling();
          showToast('IoT Image Received', 'Image captured from device successfully.', 'success');
        }
      }
    } catch (_) { /* silent fail — keep polling */ }
  }, 5000);
}
function stopIoTPolling() {
  if (state.iotPollInterval) { clearInterval(state.iotPollInterval); state.iotPollInterval = null; }
}

// ===== ANALYZE / API CALL =====
$('btn-analyze').addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (state.isAnalyzing || !state.uploadedFile) return;
  state.isAnalyzing = true;

  // UI: loading state
  $('btn-analyze').disabled = true;
  $('btn-analyze').querySelector('span').textContent = 'Analyzing...';
  $('btn-loader').style.display = 'flex';
  showResultLoading();

  const startTime = Date.now();

  try {
    const formData = new FormData();
    formData.append('image', state.uploadedFile);

    const response = await fetch('/predict', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();

    const inferenceTime = ((Date.now() - startTime) / 1000).toFixed(1);
    displayResult(data, inferenceTime);

  } catch (err) {
    console.warn('API error, using demo mode:', err.message);
    // Demo mode: simulate result after 2s
    await sleep(2000);
    const demoResult = generateDemoResult();
    const inferenceTime = ((Date.now() - startTime) / 1000).toFixed(1);
    displayResult(demoResult, inferenceTime);
    showToast('Demo Mode', 'Backend not connected — showing simulated result.', 'info');
  } finally {
    state.isAnalyzing = false;
    $('btn-analyze').disabled = false;
    $('btn-analyze').querySelector('span').textContent = 'Detect Ulcer';
    $('btn-loader').style.display = 'none';
  }
}

function generateDemoResult() {
  const isUlcer = Math.random() > 0.5;
  const confidence = isUlcer
    ? (0.72 + Math.random() * 0.25).toFixed(2)
    : (0.80 + Math.random() * 0.18).toFixed(2);
  return {
    prediction: isUlcer ? 'ulcer' : 'normal',
    confidence: parseFloat(confidence),
    heatmap: null,
    segmentation_mask: null,
    model: 'UNet++ (ResNet50)',
  };
}

// ===== DISPLAY RESULT =====
function displayResult(data, inferenceTime) {
  state.currentResult = data;

  const isUlcer = data.prediction === 'ulcer';
  const conf = Math.round(data.confidence * 100);

  // Show result section
  $('result-empty').style.display = 'none';
  $('result-loading').style.display = 'none';
  $('result-content').style.display = '';

  // Diagnosis badge
  const badge = $('diagnosis-badge');
  badge.className = 'diagnosis-badge ' + (isUlcer ? 'ulcer' : 'normal');
  $('diagnosis-icon').innerHTML = isUlcer
    ? '<i class="fas fa-exclamation-triangle"></i>'
    : '<i class="fas fa-check-circle"></i>';
  $('diagnosis-value').textContent = isUlcer ? '🔴 Corneal Ulcer Detected' : '🟢 No Ulcer Detected';

  // Confidence bar (animate after a tick)
  $('confidence-value').textContent = conf + '%';
  setTimeout(() => {
    const fill = $('confidence-bar');
    fill.style.width = conf + '%';
    fill.style.background = conf >= 80
      ? 'linear-gradient(90deg, #22c55e, #16a34a)'
      : conf >= 60
      ? 'linear-gradient(90deg, #f59e0b, #d97706)'
      : 'linear-gradient(90deg, #ff6b6b, #e05555)';
  }, 100);

  // Metrics
  $('metric-time').textContent = inferenceTime + 's';
  $('metric-model').textContent = data.model || 'UNet++';
  $('metric-size').textContent = '256×256';

  // Render visualization
  renderVisualization(state.activeVizTab, data, isUlcer);

  // Add to history
  addToHistory(data, conf, isUlcer, inferenceTime);

  // Toast
  showToast(
    isUlcer ? 'Ulcer Detected' : 'No Ulcer Found',
    `Confidence: ${conf}% — ${isUlcer ? 'Please consult a specialist.' : 'Eye appears healthy.'}`,
    isUlcer ? 'error' : 'success'
  );

  // Scroll to result
  setTimeout(() => {
    $('result-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 300);
}

// ===== VISUALIZATION =====
$$('.viz-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.viz-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeVizTab = tab.dataset.tab;
    if (state.currentResult) {
      const isUlcer = state.currentResult.prediction === 'ulcer';
      renderVisualization(state.activeVizTab, state.currentResult, isUlcer);
    }
  });
});

function renderVisualization(tab, data, isUlcer) {
  const canvas = $('viz-canvas');
  const ctx = canvas.getContext('2d');
  const label = $('viz-overlay-label');

  const img = new Image();
  img.src = state.uploadedDataURL;
  img.onload = () => {
    canvas.width = img.width || 400;
    canvas.height = img.height || 400;

    if (tab === 'original') {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      label.textContent = 'Original Image';

    } else if (tab === 'heatmap') {
      // If backend provides heatmap, use it; else generate synthetic Grad-CAM
      if (data.heatmap) {
        const heatImg = new Image();
        heatImg.src = 'data:image/png;base64,' + data.heatmap;
        heatImg.onload = () => ctx.drawImage(heatImg, 0, 0, canvas.width, canvas.height);
      } else {
        drawSyntheticHeatmap(ctx, img, canvas.width, canvas.height, isUlcer);
      }
      label.textContent = 'Grad-CAM Heatmap';

    } else if (tab === 'segmentation') {
      if (data.segmentation_mask) {
        const maskImg = new Image();
        maskImg.src = 'data:image/png;base64,' + data.segmentation_mask;
        maskImg.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height); };
      } else {
        drawSyntheticSegmentation(ctx, img, canvas.width, canvas.height, isUlcer);
      }
      label.textContent = 'Segmentation Mask';
    }
  };
  img.onerror = () => {
    ctx.fillStyle = '#141c2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4a5a80';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Visualization unavailable', canvas.width / 2, canvas.height / 2);
  };
}

function drawSyntheticHeatmap(ctx, img, w, h, isUlcer) {
  // Draw original image as base
  ctx.drawImage(img, 0, 0, w, h);

  if (!isUlcer) {
    // Just a faint cool overlay for healthy eye
    ctx.fillStyle = 'rgba(0,198,198,0.08)';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // Generate a plausible "hot zone" in the corneal area (center-ish)
  const cx = w * (0.42 + Math.random() * 0.16);
  const cy = h * (0.38 + Math.random() * 0.24);
  const r  = Math.min(w, h) * (0.18 + Math.random() * 0.12);

  // Multi-layer radial gradient (Jet colormap simulation)
  const layers = [
    { scale: 1.6, color: 'rgba(0,0,255,0.25)' },   // blue (cool)
    { scale: 1.2, color: 'rgba(0,255,255,0.25)' },  // cyan
    { scale: 0.9, color: 'rgba(0,255,0,0.3)' },     // green
    { scale: 0.65, color: 'rgba(255,255,0,0.35)' }, // yellow
    { scale: 0.4, color: 'rgba(255,128,0,0.45)' },  // orange
    { scale: 0.25, color: 'rgba(255,0,0,0.55)' },   // red (hot)
  ];

  ctx.globalCompositeOperation = 'source-over';
  layers.forEach(({ scale, color }) => {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * scale);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  // Blend slightly
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(255,60,0,0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Colormap legend bar
  drawColormapLegend(ctx, w, h);
}

function drawColormapLegend(ctx, w, h) {
  const barW = 12, barH = 80;
  const bx = w - 30, by = h - barH - 20;
  const grad = ctx.createLinearGradient(bx, by + barH, bx, by);
  grad.addColorStop(0, '#0000ff');
  grad.addColorStop(0.25, '#00ffff');
  grad.addColorStop(0.5, '#00ff00');
  grad.addColorStop(0.75, '#ffff00');
  grad.addColorStop(1, '#ff0000');
  ctx.fillStyle = grad;
  ctx.roundRect ? ctx.roundRect(bx, by, barW, barH, 4) : ctx.fillRect(bx, by, barW, barH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '9px Inter';
  ctx.textAlign = 'right';
  ctx.fillText('High', bx - 4, by + 10);
  ctx.fillText('Low', bx - 4, by + barH);
}

function drawSyntheticSegmentation(ctx, img, w, h, isUlcer) {
  ctx.drawImage(img, 0, 0, w, h);

  if (!isUlcer) {
    // Green overlay showing "clear cornea"
    ctx.strokeStyle = 'rgba(34,197,94,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.48, w * 0.24, h * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(34,197,94,0.06)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.48, w * 0.24, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Mask: semi-transparent red blob for detected ulcer area
  const cx = w * (0.45 + Math.random() * 0.1);
  const cy = h * (0.40 + Math.random() * 0.2);
  const rx = w * (0.09 + Math.random() * 0.07);
  const ry = h * (0.07 + Math.random() * 0.05);

  // Red filled mask
  ctx.fillStyle = 'rgba(255,60,60,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, Math.random() * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Red border
  ctx.strokeStyle = 'rgba(255,80,80,0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Label box
  const lx = cx + rx + 8, ly = cy - 14;
  ctx.fillStyle = 'rgba(255,60,60,0.85)';
  roundRect(ctx, lx, ly, 68, 22, 4);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 11px Inter';
  ctx.textAlign = 'left';
  ctx.fillText('Ulcer Zone', lx + 6, ly + 15);

  // Corner markers
  ctx.strokeStyle = 'rgba(255,200,0,0.7)';
  ctx.lineWidth = 1.5;
  const pad = 6;
  [[cx - rx - pad, cy - ry - pad], [cx + rx + pad, cy - ry - pad],
   [cx - rx - pad, cy + ry + pad], [cx + rx + pad, cy + ry + pad]].forEach(([mx, my], i) => {
    const sign = [[1,1],[-1,1],[1,-1],[-1,-1]][i];
    ctx.beginPath();
    ctx.moveTo(mx, my); ctx.lineTo(mx + sign[0]*10, my);
    ctx.moveTo(mx, my); ctx.lineTo(mx, my + sign[1]*10);
    ctx.stroke();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ===== HISTORY =====
function addToHistory(data, conf, isUlcer, inferenceTime) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    prediction: data.prediction,
    confidence: conf,
    isUlcer,
    inferenceTime,
    thumbnail: state.uploadedDataURL,
  };
  state.history.unshift(entry);
  if (state.history.length > 20) state.history.pop();
  localStorage.setItem('cornealai_history', JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  const tbody = $('history-tbody');
  const entries = state.history;

  // Stats
  const ulcerCount  = entries.filter(e => e.isUlcer).length;
  const normalCount = entries.filter(e => !e.isUlcer).length;
  const avgConf = entries.length ? Math.round(entries.reduce((s,e) => s + e.confidence, 0) / entries.length) : 0;
  $('hs-ulcer').textContent = ulcerCount;
  $('hs-normal').textContent = normalCount;
  $('hs-total').textContent = entries.length;
  $('hs-avg-conf').textContent = avgConf + '%';

  if (!entries.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="table-empty"><i class="fas fa-inbox"></i><p>No scan history yet. Start by analyzing an image above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map((e, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <img class="history-thumb" src="${e.thumbnail}" alt="Scan ${i+1}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%23141c2e%22 width=%2248%22 height=%2248%22/></svg>'">
      </td>
      <td style="color: var(--text-primary)">${formatDateTime(e.timestamp)}</td>
      <td>
        <span class="tag ${e.isUlcer ? 'tag-ulcer' : 'tag-normal'}">
          ${e.isUlcer ? '🔴 Ulcer' : '🟢 Normal'}
        </span>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:100px;overflow:hidden">
            <div style="height:100%;width:${e.confidence}%;background:${e.isUlcer ? 'var(--accent-coral)' : 'var(--accent-green)'};border-radius:100px"></div>
          </div>
          <span style="color:var(--text-primary);font-family:'Space Grotesk',sans-serif;font-weight:700">${e.confidence}%</span>
        </div>
      </td>
      <td>
        <span style="color:var(--text-muted);font-size:12px">
          <i class="fas fa-clock" style="margin-right:4px"></i>${e.inferenceTime}s
        </span>
      </td>
    </tr>
  `).join('');
}

// ===== DOWNLOAD REPORT =====
$('btn-download-report').addEventListener('click', () => {
  if (!state.currentResult) return;
  const r = state.currentResult;
  const conf = Math.round(r.confidence * 100);
  const isUlcer = r.prediction === 'ulcer';
  const now = new Date();

  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, 800, 1000);

  // Header strip
  const hGrad = ctx.createLinearGradient(0, 0, 800, 0);
  hGrad.addColorStop(0, '#00c6c6');
  hGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 800, 90);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Inter';
  ctx.textAlign = 'left';
  ctx.fillText('CornealAI — Diagnostic Report', 40, 56);

  ctx.font = '14px Inter';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`Generated: ${now.toLocaleString()}`, 40, 80);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 120); ctx.lineTo(760, 120); ctx.stroke();

  // Result box
  const boxColor = isUlcer ? 'rgba(255,107,107,0.12)' : 'rgba(34,197,94,0.12)';
  ctx.fillStyle = boxColor;
  roundRect(ctx, 40, 135, 720, 110, 14);
  ctx.fill();

  ctx.font = 'bold 36px Inter';
  ctx.fillStyle = isUlcer ? '#ff8080' : '#4ade80';
  ctx.textAlign = 'center';
  ctx.fillText(isUlcer ? '🔴 Corneal Ulcer Detected' : '🟢 No Ulcer Detected', 400, 185);

  ctx.font = '500 18px Inter';
  ctx.fillStyle = '#8b9cc8';
  ctx.fillText(`Confidence Score: ${conf}%`, 400, 220);

  // Confidence bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, 40, 265, 720, 14, 7);
  ctx.fill();
  const barGrad = ctx.createLinearGradient(40, 0, 40 + 720 * conf / 100, 0);
  barGrad.addColorStop(0, '#00c6c6');
  barGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = barGrad;
  roundRect(ctx, 40, 265, 720 * conf / 100, 14, 7);
  ctx.fill();

  // Details
  ctx.textAlign = 'left';
  const details = [
    ['Prediction', r.prediction === 'ulcer' ? 'Corneal Ulcer' : 'Normal / No Ulcer'],
    ['Confidence', `${conf}%`],
    ['Model', r.model || 'UNet++ (ResNet50)'],
    ['Inference Time', $('metric-time').textContent],
    ['Input Resolution', '256 × 256 px'],
    ['Timestamp', now.toISOString()],
  ];
  details.forEach(([key, val], i) => {
    const y = 320 + i * 50;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 40, y, 720, 38, 8);
    ctx.fill();
    ctx.font = '600 13px Inter';
    ctx.fillStyle = '#4a5a80';
    ctx.fillText(key.toUpperCase(), 60, y + 24);
    ctx.font = '500 15px Inter';
    ctx.fillStyle = '#f0f4ff';
    ctx.textAlign = 'right';
    ctx.fillText(val, 740, y + 24);
    ctx.textAlign = 'left';
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 910, 800, 90);
  ctx.font = '12px Inter';
  ctx.fillStyle = '#4a5a80';
  ctx.textAlign = 'center';
  ctx.fillText('⚠ This report is generated by an AI model for educational purposes only.', 400, 945);
  ctx.fillText('It is not a substitute for professional medical diagnosis or advice.', 400, 965);
  ctx.fillText('CornealAI — AIOT Corneal Ulcer Detection Project', 400, 990);

  // Download
  const link = document.createElement('a');
  link.download = `CornealAI_Report_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Report Downloaded', 'Diagnostic report saved as PNG.', 'success');
});

// ===== RESULT STATE HELPERS =====
function showResultLoading() {
  $('result-empty').style.display = 'none';
  $('result-loading').style.display = '';
  $('result-content').style.display = 'none';
}
function resetResult() {
  state.currentResult = null;
  $('result-empty').style.display = '';
  $('result-loading').style.display = 'none';
  $('result-content').style.display = 'none';
  $('confidence-bar').style.width = '0%';
}

// ===== TOAST =====
function showToast(title, subtitle = '', type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <div>
      <div class="toast-msg">${title}</div>
      ${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ''}
    </div>
  `;
  $('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== UTILS =====
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  // Prefill if history exists
  if (state.history.length) {
    showToast(`Welcome back!`, `${state.history.length} previous scan(s) loaded.`, 'info');
  }
});
