/* ==========================================================================
   GRIDLI-POV — Artist Plein Air Precision Mobile Viewfinder
   assets/js/main.js
   Externalized script (Master Protocol: Externalized JS Standard)
   Full rewrite — do not delete existing logic when adding new features.
   ========================================================================== */

/* --------------------------------------------------------------------
   Element references
   -------------------------------------------------------------------- */
const video = document.getElementById('webcam');
const streamImg = document.getElementById('stream-img');
const cropBox = document.getElementById('crop-box');
const gridOverlay = document.getElementById('grid-overlay');
const sizeSelect = document.getElementById('size-select');
const gridToggle = document.getElementById('grid-toggle');
const gridColorInput = document.getElementById('grid-color');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessVal = document.getElementById('thickness-val');
const refreshBtn = document.getElementById('refresh-btn');
const shutterBtn = document.getElementById('shutter-btn');
const btnLandscape = document.getElementById('orient-landscape');
const btnPortrait = document.getElementById('orient-portrait');
const canvas = document.getElementById('capture-canvas');
const viewfinderContainer = document.getElementById('viewfinder-container');
const cameraStatus = document.getElementById('camera-status');

const sourceToggleBtn = document.getElementById('source-toggle-btn');
const sourcePanel = document.getElementById('source-panel');
const sourceTypeSelect = document.getElementById('source-type-select');
const streamAddressInput = document.getElementById('stream-address');
const streamConnectBtn = document.getElementById('stream-connect-btn');
const streamStatusDot = document.getElementById('stream-status-dot');
const streamStatusText = document.getElementById('stream-status-text');

/* --------------------------------------------------------------------
   Shared state
   -------------------------------------------------------------------- */
let currentOrientation = 'portrait';
let selectedColor = '#ffffff';
let lineThickness = 1;

let currentSourceType = 'browser';
let streamShouldReconnect = false;
let streamRetryTimeout = null;

/* --------------------------------------------------------------------
   On-screen status messaging (camera + stream)
   -------------------------------------------------------------------- */
function showCameraStatus(message) {
    cameraStatus.textContent = message;
    cameraStatus.style.display = 'block';
}

function hideCameraStatus() {
    cameraStatus.style.display = 'none';
}

function setStreamStatus(state, text) {
    streamStatusDot.className = `status-dot ${state}`;
    streamStatusText.textContent = text;
}

/* --------------------------------------------------------------------
   Active media source helpers (browser camera vs. network stream)
   -------------------------------------------------------------------- */
function getActiveMediaElement() {
    return currentSourceType === 'browser' ? video : streamImg;
}

function getActiveMediaDimensions() {
    if (currentSourceType === 'browser') {
        return { width: video.videoWidth, height: video.videoHeight };
    }
    return { width: streamImg.naturalWidth, height: streamImg.naturalHeight };
}

function getVisibleVideoRect() {
    const containerRect = viewfinderContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const dims = getActiveMediaDimensions();

    if (!dims.width || !dims.height) {
        return {
            left: containerRect.left,
            top: containerRect.top,
            width: containerWidth,
            height: containerHeight
        };
    }

    const mediaRatio = dims.width / dims.height;
    const containerRatio = containerWidth / containerHeight;

    let width, height;
    if (mediaRatio > containerRatio) {
        width = containerWidth;
        height = containerWidth / mediaRatio;
    } else {
        height = containerHeight;
        width = containerHeight * mediaRatio;
    }

    const left = containerRect.left + (containerWidth - width) / 2;
    const top = containerRect.top + (containerHeight - height) / 2;

    return { left, top, width, height };
}

/* --------------------------------------------------------------------
   Browser camera acquisition (getUserMedia)
   -------------------------------------------------------------------- */
async function startCamera() {
    hideCameraStatus();

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraStatus(
            "Camera unavailable on this connection. Camera access requires HTTPS, or the page being loaded from 'localhost'. If you're opening this on your phone via a LAN/network IP address (like http://192.168.x.x:port), the browser blocks camera access there. Try the Source panel (📡) and use IP Webcam or DroidCam instead — that route doesn't need camera permission at all."
        );
        return;
    }

    const constraintsOptions = [
    { video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
    { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false }
    ];

    let started = false;
    let lastError = null;

    for (let constraints of constraintsOptions) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            started = true;
            break;
        } catch (err) {
            lastError = err;
            console.warn("Retrying camera stream parameters...", err);
        }
    }

    if (!started) {
        let reason = "Unable to access the camera.";
        if (lastError) {
            if (lastError.name === "NotAllowedError") {
                reason = "Camera permission was denied. Check your browser's site settings and allow camera access, then tap Refresh Camera. Or switch the Source panel (📡) to IP Webcam / DroidCam, which doesn't need this permission at all.";
            } else if (lastError.name === "NotFoundError") {
                reason = "No camera was found on this device.";
            } else if (lastError.name === "NotReadableError") {
                reason = "The camera is already in use by another app. Close it and tap Refresh Camera.";
            } else if (lastError.name) {
                reason = `Unable to access the camera (${lastError.name}).`;
            }
        }
        showCameraStatus(reason);
    }
}

/* --------------------------------------------------------------------
   Network stream source (IP Webcam / DroidCam over LAN)
   -------------------------------------------------------------------- */
function resolveStreamUrl(type, base) {
    const cleanBase = base.replace(/\/$/, '');
    if (type === 'droidcam') return `${cleanBase}/mjpegfeed`;
    return `${cleanBase}/video`;
}

function normalizeAddress(raw) {
    let addr = raw.trim();
    if (!addr) return '';
    if (!/^https?:\/\//i.test(addr)) {
        addr = `http://${addr}`;
    }
    return addr;
}

function stopNetworkStream() {
    streamShouldReconnect = false;
    if (streamRetryTimeout) {
        clearTimeout(streamRetryTimeout);
        streamRetryTimeout = null;
    }
    streamImg.src = '';
    streamImg.style.display = 'none';
}

function connectNetworkStream() {
    const type = sourceTypeSelect.value;
    const rawAddress = streamAddressInput.value;
    const base = normalizeAddress(rawAddress);

    if (!base) {
        setStreamStatus('offline', 'Enter an address first, e.g. 192.168.1.42:8080');
        return;
    }

    const url = resolveStreamUrl(type, base);
    streamShouldReconnect = true;
    hideCameraStatus();
    setStreamStatus('connecting', `Connecting to ${url}...`);

    streamImg.style.display = 'block';
    streamImg.src = `${url}?t=${Date.now()}`;
}

streamImg.addEventListener('load', () => {
    if (currentSourceType === 'browser') return;
    setStreamStatus('live', `Live — ${streamImg.naturalWidth}x${streamImg.naturalHeight}`);
    hideCameraStatus();
    updateViewfinder();
});

streamImg.addEventListener('error', () => {
    if (currentSourceType === 'browser' || !streamShouldReconnect) return;
    setStreamStatus('offline', 'Stream lost — retrying...');
    streamRetryTimeout = setTimeout(() => {
        if (!streamShouldReconnect) return;
        const current = streamImg.src.split('?')[0];
        streamImg.src = `${current}?t=${Date.now()}`;
    }, 2000);
});

/* --------------------------------------------------------------------
   Source panel UI wiring (toggle between browser camera & network stream)
   -------------------------------------------------------------------- */
function switchSourceType(type) {
    currentSourceType = type;
    hideCameraStatus();

    if (type === 'browser') {
        stopNetworkStream();
        streamAddressInput.disabled = true;
        streamConnectBtn.disabled = true;
        video.style.display = 'block';
        setStreamStatus('offline', 'Browser camera mode — no network address needed.');
        startCamera();
    } else {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        video.style.display = 'none';
        streamAddressInput.disabled = false;
        streamConnectBtn.disabled = false;
        const placeholder = type === 'droidcam' ? '192.168.1.42:4747' : '192.168.1.42:8080';
        streamAddressInput.placeholder = placeholder;
        setStreamStatus('offline', 'Enter the address shown in the app, then tap Connect.');
    }
}

sourceToggleBtn.addEventListener('click', () => {
    sourcePanel.classList.toggle('hidden');
});

sourceTypeSelect.addEventListener('change', (e) => {
    switchSourceType(e.target.value);
});

/* --------------------------------------------------------------------
   Persisted stream config (localStorage)
   -------------------------------------------------------------------- */
try {
    const saved = JSON.parse(localStorage.getItem('gridliPovStreamConfig') || 'null');
    if (saved && saved.address) {
        streamAddressInput.value = saved.address;
        if (saved.type) sourceTypeSelect.value = saved.type;
    }
} catch (e) { }

function saveStreamConfig() {
    try {
        localStorage.setItem('gridliPovStreamConfig', JSON.stringify({
            type: sourceTypeSelect.value,
            address: streamAddressInput.value.trim()
        }));
    } catch (e) { }
}

streamConnectBtn.addEventListener('click', () => {
    saveStreamConfig();
    connectNetworkStream();
});
streamAddressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveStreamConfig();
        connectNetworkStream();
    }
});

/* --------------------------------------------------------------------
   Viewfinder geometry — crop box sizing & grid overlay rendering
   -------------------------------------------------------------------- */
function updateViewfinder() {
    const dims = getActiveMediaDimensions();
    if (!dims.width) return;

    const dimensions = sizeSelect.value.split(',').map(Number);

    let inchesW = (currentOrientation === 'landscape') ? Math.max(...dimensions) : Math.min(...dimensions);
    let inchesH = (currentOrientation === 'landscape') ? Math.min(...dimensions) : Math.max(...dimensions);

    const visibleRect = getVisibleVideoRect();
    const liveVideoWidth = visibleRect.width;
    const liveVideoHeight = visibleRect.height;

    let targetWidth = liveVideoWidth;
    let targetHeight = liveVideoWidth * (inchesH / inchesW);

    if (targetHeight > liveVideoHeight) {
        targetHeight = liveVideoHeight;
        targetWidth = liveVideoHeight * (inchesW / inchesH);
    }

    cropBox.style.width = `${targetWidth}px`;
    cropBox.style.height = `${targetHeight}px`;

    gridOverlay.innerHTML = '';
    gridOverlay.style.gridTemplateColumns = `repeat(${inchesW}, 1fr)`;
    gridOverlay.style.gridTemplateRows = `repeat(${inchesH}, 1fr)`;

    const totalCells = inchesW * inchesH;
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        applyCellStyles(cell);
        gridOverlay.appendChild(cell);
    }
}

function applyCellStyles(cell) {
    cell.style.borderColor = convertHexToRgba(selectedColor, 0.4);
    cell.style.borderRightWidth = `${lineThickness}px`;
    cell.style.borderBottomWidth = `${lineThickness}px`;
}

function convertHexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

gridColorInput.addEventListener('input', (e) => {
    selectedColor = e.target.value;
    document.querySelectorAll('.grid-cell').forEach(applyCellStyles);
});

thicknessSlider.addEventListener('input', (e) => {
    lineThickness = parseInt(e.target.value);
    thicknessVal.innerText = `${lineThickness}px`;
    document.querySelectorAll('.grid-cell').forEach(applyCellStyles);
});

/* --------------------------------------------------------------------
   Frame capture & export (canvas draw + grid burn-in + download)
   -------------------------------------------------------------------- */
function captureFrame() {
    const ctx = canvas.getContext('2d');
    const boxWidth = cropBox.offsetWidth;
    const boxHeight = cropBox.offsetHeight;

    canvas.width = boxWidth;
    canvas.height = boxHeight;

    const visibleRect = getVisibleVideoRect();
    const cropRect = cropBox.getBoundingClientRect();
    const dims = getActiveMediaDimensions();
    const sourceElement = getActiveMediaElement();

    const scaleX = dims.width / visibleRect.width;
    const scaleY = dims.height / visibleRect.height;

    const sourceX = (cropRect.left - visibleRect.left) * scaleX;
    const sourceY = (cropRect.top - visibleRect.top) * scaleY;
    const sourceWidth = boxWidth * scaleX;
    const sourceHeight = boxHeight * scaleY;

    ctx.drawImage(sourceElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, boxWidth, boxHeight);

    if (gridOverlay.style.display !== 'none') {
        const dimensions = sizeSelect.value.split(',').map(Number);
        let inchesW = (currentOrientation === 'landscape') ? Math.max(...dimensions) : Math.min(...dimensions);
        let inchesH = (currentOrientation === 'landscape') ? Math.min(...dimensions) : Math.max(...dimensions);

        ctx.strokeStyle = convertHexToRgba(selectedColor, 0.5);
        ctx.lineWidth = lineThickness;

        for (let i = 1; i < inchesW; i++) {
            let x = (boxWidth / inchesW) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, boxHeight);
            ctx.stroke();
        }
        for (let j = 1; j < inchesH; j++) {
            let y = (boxHeight / inchesH) * j;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(boxWidth, y);
            ctx.stroke();
        }
    }

    try {
        const imageURL = canvas.toDataURL('image/jpeg', 0.95);
        const downloadLink = document.createElement('a');
        downloadLink.href = imageURL;
        downloadLink.download = `plein-air-${sizeSelect.options[sizeSelect.selectedIndex].text.replace(/["\s]/g, '')}-${currentOrientation}-${Date.now()}.jpg`;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    } catch (e) {
        const win = window.open();
        if(win) {
            win.document.write(`<img src="${canvas.toDataURL('image/jpeg', 0.95)}" style="width:100%"/>`);
            win.document.title = "Save your Viewfinder capture";
        } else {
            showCameraStatus("Please allow popups, or use the shutter again to save imagery.");
            setTimeout(hideCameraStatus, 4000);
        }
    }
}

/* --------------------------------------------------------------------
   Orientation, grid toggle, refresh & resize event bindings
   -------------------------------------------------------------------- */
btnLandscape.addEventListener('click', () => {
    currentOrientation = 'landscape';
    btnLandscape.className = 'active-mode';
    btnPortrait.className = '';
    updateViewfinder();
});

btnPortrait.addEventListener('click', () => {
    currentOrientation = 'portrait';
    btnPortrait.className = 'active-mode';
    btnLandscape.className = '';
    updateViewfinder();
});

gridToggle.addEventListener('click', () => {
    const isVisible = gridOverlay.style.display !== 'none';
    gridOverlay.style.display = isVisible ? 'none' : 'grid';
    gridToggle.innerText = isVisible ? "Grid: OFF" : "Grid: ON";
    gridToggle.className = isVisible ? "" : "active-mode";
});

refreshBtn.addEventListener('click', () => {
    if (currentSourceType === 'browser') {
        startCamera();
    } else {
        connectNetworkStream();
    }
});

sizeSelect.addEventListener('change', updateViewfinder);

window.addEventListener('resize', () => setTimeout(updateViewfinder, 150));
window.addEventListener('orientationchange', () => setTimeout(updateViewfinder, 200));

video.addEventListener('loadedmetadata', updateViewfinder);
shutterBtn.addEventListener('click', captureFrame);

/* --------------------------------------------------------------------
   Initial boot state
   -------------------------------------------------------------------- */
streamAddressInput.disabled = true;
streamConnectBtn.disabled = true;
startCamera();
