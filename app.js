import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs";

const DB_NAME = "pdf-webslides";
const STORE_NAME = "sessions";
const BLACK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const VIEWER_CHANNEL_PREFIX = "pdf-webslides:";
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
const RENDER_WIDTH = 1920;
const RENDER_HEIGHT = 1080;
const NOTE_ANNOTATION_SUBTYPES = new Set([
  "Text",
  "FreeText",
  "Popup",
  "Highlight",
  "Underline",
  "Squiggly",
  "StrikeOut",
  "Stamp",
  "Caret",
  "Ink",
]);

const state = {
  pdfDoc: null,
  slides: [],
  slide: 0,
  lastSlide: 0,
  presenter: true,
  audience: false,
  overview: false,
  pointer: false,
  pointerPos: { x: 0.5, y: 0.5 },
  freeze: false,
  black: false,
  showHours: true,
  timerRunning: false,
  duration: 0,
  startTime: 0,
  noteFontSize: 125,
  presenterSidebarWidth: 360,
  sessionId: null,
  channel: null,
  audienceWindow: null,
  renderToken: 0,
  syncing: false,
  resizingSplit: false,
};

const els = {
  body: document.body,
  topbar: document.getElementById("topbar"),
  presenterToolbar: document.getElementById("presenter-toolbar"),
  presenterActions: document.getElementById("presenter-actions"),
  emptyState: document.getElementById("empty-state"),
  presenterView: document.getElementById("presenter-view"),
  overviewView: document.getElementById("overview-view"),
  audienceView: document.getElementById("audience-view"),
  currentStage: document.getElementById("current-stage"),
  currentSlide: document.getElementById("current-slide"),
  currentVideoLayer: document.getElementById("current-video-layer"),
  nextSlide: document.getElementById("next-slide"),
  nextVideoLayer: document.getElementById("next-video-layer"),
  audienceSlide: document.getElementById("audience-slide"),
  audienceVideoLayer: document.getElementById("audience-video-layer"),
  presenterSplitter: document.getElementById("presenter-splitter"),
  notes: document.getElementById("notes"),
  timer: document.getElementById("timer"),
  pageIndicator: document.getElementById("page-indicator"),
  statusText: document.getElementById("status-text"),
  pdfInput: document.getElementById("pdf-input"),
  pdfInputHero: document.getElementById("pdf-input-hero"),
  openAudienceBtn: document.getElementById("open-audience-btn"),
  overviewBtn: document.getElementById("overview-btn"),
  closeOverviewBtn: document.getElementById("close-overview-btn"),
  blackoutBtn: document.getElementById("blackout-btn"),
  freezeBtn: document.getElementById("freeze-btn"),
  pointerBtn: document.getElementById("pointer-btn"),
  overviewGrid: document.getElementById("overview-grid"),
  pointerDot: document.getElementById("pointer-dot"),
  audiencePointerDot: document.getElementById("audience-pointer-dot"),
  blackoutOverlay: document.getElementById("blackout-overlay"),
  loadingOverlay: document.getElementById("loading-overlay"),
  loadingLabel: document.getElementById("loading-label"),
  loadingBarFill: document.getElementById("loading-bar-fill"),
  loadingDetail: document.getElementById("loading-detail"),
};

init().catch((error) => {
  console.error(error);
  setStatus(`Failed to initialize: ${error.message}`);
});

async function init() {
  state.audience = new URL(window.location.href).searchParams.get("audience") === "1";
  state.presenter = !state.audience;
  applyModeLayout();
  bindEvents();
  await restoreSessionFromUrl();
  window.setInterval(updateTimerDisplay, 200);
  window.addEventListener("resize", syncPointerVisuals);
}

function bindEvents() {
  els.pdfInput.addEventListener("change", onFilePicked);
  els.pdfInputHero.addEventListener("change", onFilePicked);
  els.openAudienceBtn.addEventListener("click", openAudienceWindow);
  els.overviewBtn.addEventListener("click", showOverview);
  els.closeOverviewBtn.addEventListener("click", hideOverview);
  els.blackoutBtn.addEventListener("click", () => toggleBlackout());
  els.freezeBtn.addEventListener("click", () => toggleFreeze());
  els.pointerBtn.addEventListener("click", () => togglePointer());
  els.presenterSplitter.addEventListener("pointerdown", startPresenterResize);
  els.presenterSplitter.addEventListener("keydown", onPresenterSplitterKeyDown);

  els.timer.addEventListener("click", setTimerDuration);
  els.timer.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    state.showHours = !state.showHours;
    updateTimerDisplay();
    broadcastState("timer-format");
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("beforeunload", () => {
    if (state.channel) {
      state.channel.postMessage({ type: "window-closing", audience: state.audience });
    }
  });

  const swipeTargets = [els.currentStage, els.audienceView];
  for (const target of swipeTargets) {
    let startX = 0;
    target.addEventListener("touchstart", (event) => {
      startX = event.changedTouches[0].clientX;
    }, { passive: true });
    target.addEventListener("touchend", (event) => {
      const endX = event.changedTouches[0].clientX;
      if (endX > startX + 24) {
        prev();
      } else if (endX < startX - 24) {
        next();
      }
    }, { passive: true });
  }

  els.currentStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      prev();
    } else {
      next();
    }
  }, { passive: false });

  els.currentStage.addEventListener("mousemove", onPointerMove);
}

function applyModeLayout() {
  const hasSlides = !!state.slides.length;
  els.body.classList.toggle("audience-mode", state.audience);
  els.body.classList.toggle("resizing-split", state.resizingSplit);
  els.topbar.classList.toggle("hidden", state.audience);
  els.presenterActions.classList.toggle("hidden", state.audience || !hasSlides);
  els.emptyState.classList.toggle("hidden", state.audience || hasSlides);
  els.presenterView.classList.toggle("hidden", state.audience || !hasSlides || state.overview);
  els.overviewView.classList.toggle("hidden", state.audience || !state.overview);
  els.audienceView.classList.toggle("hidden", !state.audience);
  els.presenterView.style.setProperty(
    "--sidebar-width",
    `${clamp(state.presenterSidebarWidth, 280, 720)}px`
  );
}

async function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  const sessionId = createSessionId();
  await saveSessionPdf(sessionId, arrayBuffer, file.name);
  replaceUrlSession(sessionId, state.audience);
  await loadPdfFromBytes(arrayBuffer, sessionId, file.name);

  if (event.target !== els.pdfInput) {
    els.pdfInput.value = "";
  }
  if (event.target !== els.pdfInputHero) {
    els.pdfInputHero.value = "";
  }
}

async function restoreSessionFromUrl() {
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    applyModeLayout();
    return;
  }

  const session = await loadSessionPdf(sessionId);
  if (!session) {
    setStatus("Saved PDF session was not found");
    return;
  }

  await loadPdfFromBytes(session.bytes, sessionId, session.name);
}

async function loadPdfFromBytes(arrayBuffer, sessionId, name) {
  const renderToken = ++state.renderToken;
  setStatus("Loading PDF...");
  showLoading("Loading PDF...", "Opening document", 2);
  state.sessionId = sessionId;
  setupChannel();

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  state.pdfDoc = await loadingTask.promise;
  if (renderToken !== state.renderToken) {
    return;
  }
  showLoading("Rendering slides...", `Rendering 0/${state.pdfDoc.numPages}`, 5);

  const slides = [];
  for (let pageNumber = 1; pageNumber <= state.pdfDoc.numPages; pageNumber += 1) {
    setStatus(`Rendering slide ${pageNumber}/${state.pdfDoc.numPages}`);
    setLoadingProgress(
      "Rendering slides...",
      `Rendering slide ${pageNumber}/${state.pdfDoc.numPages}`,
      5 + Math.round((pageNumber - 1) / state.pdfDoc.numPages * 90)
    );
    const page = await state.pdfDoc.getPage(pageNumber);
    const slide = await renderSlide(page);
    slides.push(slide);
  }

  if (renderToken !== state.renderToken) {
    return;
  }

  state.slides = slides;
  state.slide = state.audience
    ? Math.max(0, Math.min(state.slide, slides.length - 1))
    : 0;
  state.lastSlide = Math.max(0, slides.length - 1);
  state.startTime = 0;
  state.timerRunning = false;
  state.overview = false;
  els.notes.style.fontSize = `${state.noteFontSize}%`;

  applyModeLayout();
  renderOverview();
  render();
  setStatus(`Loaded ${slides.length} slides from ${name}`);
  setLoadingProgress("Finalizing...", "Preparing presenter view", 100);
  window.setTimeout(hideLoading, 120);
  broadcastState("loaded");
}

async function renderSlide(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    RENDER_WIDTH / baseViewport.width,
    RENDER_HEIGHT / baseViewport.height
  );
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = RENDER_WIDTH;
  canvas.height = RENDER_HEIGHT;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = Math.round((RENDER_WIDTH - viewport.width) / 2);
  const offsetY = Math.round((RENDER_HEIGHT - viewport.height) / 2);

  await page.render({
    canvasContext: context,
    viewport,
    background: "rgb(255, 255, 255)",
    transform: [1, 0, 0, 1, offsetX, offsetY],
  }).promise;

  const thumbCanvas = document.createElement("canvas");
  const thumbWidth = 320;
  const thumbScale = thumbWidth / canvas.width;
  thumbCanvas.width = Math.ceil(canvas.width * thumbScale);
  thumbCanvas.height = Math.ceil(canvas.height * thumbScale);
  thumbCanvas.getContext("2d").drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const annotations = await loadPageAnnotations(page);
  const notes = extractNotes(annotations);
  const videos = extractVideos(annotations, viewport);

  return {
    image: canvas.toDataURL("image/png"),
    thumb: thumbCanvas.toDataURL("image/png"),
    notes,
    videos,
    width: canvas.width,
    height: canvas.height,
  };
}

async function loadPageAnnotations(page) {
  const annotationSets = await Promise.all([
    page.getAnnotations(),
    page.getAnnotations({ intent: "any" }),
  ]);

  const merged = [];
  const seen = new Set();

  for (const annotations of annotationSets) {
    for (const annotation of annotations) {
      const key = annotationIdentity(annotation);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(annotation);
    }
  }

  return merged;
}

function annotationIdentity(annotation) {
  if (!annotation || typeof annotation !== "object") {
    return String(annotation);
  }

  return [
    annotation.id,
    annotation.annotationType,
    annotation.subtype,
    annotation.popupRef,
    Array.isArray(annotation.rect) ? annotation.rect.join(",") : "",
    annotation.contentsObj?.str ?? annotation.contents ?? "",
  ].join("|");
}

function extractNotes(annotations) {
  const seen = new Set();
  const notes = [];

  for (const annotation of annotations) {
    if (!isLikelyNoteAnnotation(annotation)) {
      continue;
    }

    const note = formatAnnotationNote(annotation);
    if (!note || seen.has(note)) {
      continue;
    }

    seen.add(note);
    notes.push(note);
  }

  return notes.join("\n\n");
}

function isLikelyNoteAnnotation(annotation) {
  if (!annotation || typeof annotation !== "object") {
    return false;
  }

  const subtype = typeof annotation.subtype === "string" ? annotation.subtype : "";
  const normalizedSubtype = subtype.trim();
  if (NOTE_ANNOTATION_SUBTYPES.has(normalizedSubtype)) {
    return true;
  }

  if (annotation.name === "Comment" || annotation.iconName === "Comment") {
    return true;
  }

  return Boolean(annotation.popupRef);
}

function formatAnnotationNote(annotation) {
  const contents = firstNormalizedNoteText([
    annotation.contentsObj?.str,
    annotation.contents,
    annotation.richText?.str,
    annotation.richText,
    annotation.alternativeText,
  ]);
  if (!contents) {
    return "";
  }

  const title = firstNormalizedNoteText([
    annotation.titleObj?.str,
    annotation.title,
    annotation.subject,
    annotation.fieldName,
  ]);
  if (title && !contents.startsWith(`${title}:`) && title !== contents) {
    return `${title}: ${contents}`;
  }

  return contents;
}

function firstNormalizedNoteText(values) {
  for (const value of values) {
    const normalized = normalizeNoteText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeNoteText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractVideos(annotations, viewport) {
  return annotations
    .map((annotation) => {
      const candidate = annotation.url || annotation.unsafeUrl || annotation.action || annotation.file;
      const url = typeof candidate === "string" ? candidate : null;
      if (!url || !isVideoUrl(url)) {
        return null;
      }

      let rect = null;
      if (Array.isArray(annotation.rect) && annotation.rect.length === 4) {
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        rect = {
          x: left / viewport.width,
          y: top / viewport.height,
          width: width / viewport.width,
          height: height / viewport.height,
        };
      }

      return { url, rect };
    })
    .filter(Boolean);
}

function isVideoUrl(url) {
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.includes(extension));
}

function render() {
  updateModeVisibility();
  updateControlStates();

  if (!state.slides.length) {
    return;
  }

  const current = state.slides[state.slide];
  const nextSlide = state.slides[Math.min(state.slide + 1, state.slides.length - 1)];

  if (state.presenter && !state.overview) {
    els.currentSlide.src = current.image;
    els.nextSlide.src = nextSlide.image;
    els.notes.textContent = current.notes || "No notes for this slide";
    els.pageIndicator.textContent = `${state.slide + 1}/${state.lastSlide + 1}`;
    renderVideos(els.currentVideoLayer, current.videos);
    renderVideos(els.nextVideoLayer, nextSlide.videos);
  }

  if (state.audience) {
    els.audienceSlide.src = state.black ? BLACK_PIXEL : current.image;
    els.blackoutOverlay.classList.toggle("hidden", !state.black);
    renderVideos(els.audienceVideoLayer, state.black ? [] : current.videos);
  }

  syncPointerVisuals();
  updateTimerDisplay();
}

function updateModeVisibility() {
  if (state.audience) {
    els.emptyState.classList.add("hidden");
    els.presenterView.classList.add("hidden");
    els.overviewView.classList.add("hidden");
    els.audienceView.classList.remove("hidden");
  } else {
    els.emptyState.classList.toggle("hidden", !!state.slides.length);
    els.presenterView.classList.toggle("hidden", !state.slides.length || state.overview);
    els.overviewView.classList.toggle("hidden", !state.overview);
    els.audienceView.classList.add("hidden");
  }
}

function renderVideos(layer, videos) {
  layer.replaceChildren();
  for (const video of videos) {
    const element = document.createElement("video");
    element.src = video.url;
    element.controls = true;
    element.preload = "metadata";

    if (video.rect) {
      element.style.left = `${video.rect.x * 100}%`;
      element.style.top = `${video.rect.y * 100}%`;
      element.style.width = `${video.rect.width * 100}%`;
      element.style.height = `${video.rect.height * 100}%`;
    } else {
      element.style.left = "0";
      element.style.top = "0";
      element.style.width = "100%";
      element.style.height = "100%";
    }

    layer.appendChild(element);
  }
}

function renderOverview() {
  els.overviewGrid.replaceChildren();
  state.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overview-thumb";
    button.addEventListener("click", () => {
      goto(index);
      hideOverview();
    });

    const image = document.createElement("img");
    image.src = slide.thumb;
    image.alt = `Slide ${index + 1}`;

    const label = document.createElement("span");
    label.textContent = `Slide ${index + 1}`;

    button.append(image, label);
    els.overviewGrid.appendChild(button);
  });
}

function updateControlStates() {
  els.blackoutBtn.classList.toggle("active", state.black);
  els.freezeBtn.classList.toggle("active", state.freeze);
  els.pointerBtn.classList.toggle("active", state.pointer);
}

function onKeyDown(event) {
  if (!state.slides.length) {
    if (!state.audience && event.key.toLowerCase() === "o") {
      els.pdfInput.click();
    }
    return;
  }

  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    prev();
  } else if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    next();
  } else if (event.key === "Home") {
    event.preventDefault();
    goto(0);
  } else if (event.key === "End") {
    event.preventDefault();
    goto(state.slides.length - 1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    state.overview ? hideOverview() : showOverview();
  } else if (event.key.toLowerCase() === "g") {
    event.preventDefault();
    const answer = window.prompt("Go to slide", String(state.slide + 1));
    const numeric = Number.parseInt(answer ?? "", 10);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= state.slides.length) {
      goto(numeric - 1);
    }
  } else if (event.key.toLowerCase() === "e") {
    event.preventDefault();
    state.lastSlide = state.slide;
    render();
    broadcastState("last-slide");
  } else if (event.key === "+") {
    event.preventDefault();
    state.noteFontSize += 10;
    els.notes.style.fontSize = `${state.noteFontSize}%`;
  } else if (event.key === "-") {
    event.preventDefault();
    state.noteFontSize = Math.max(60, state.noteFontSize - 10);
    els.notes.style.fontSize = `${state.noteFontSize}%`;
  } else if (event.key.toLowerCase() === "b") {
    event.preventDefault();
    toggleBlackout();
  } else if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFreeze();
  } else if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    state.startTime = Date.now();
    state.timerRunning = false;
    updateTimerDisplay();
    broadcastState("timer-reset");
  } else if (event.key.toLowerCase() === "p" || event.key === "Backspace") {
    event.preventDefault();
    togglePointer();
  } else if (event.key.toLowerCase() === "o") {
    event.preventDefault();
    openAudienceWindow();
  }
}

function next() {
  if (state.slide >= state.slides.length - 1) {
    return;
  }
  if (!state.timerRunning) {
    state.timerRunning = true;
    state.startTime = Date.now();
  }
  state.slide += 1;
  render();
  broadcastState("next");
}

function prev() {
  if (state.slide <= 0) {
    return;
  }
  state.slide -= 1;
  render();
  broadcastState("prev");
}

function goto(index) {
  state.slide = Math.max(0, Math.min(index, state.slides.length - 1));
  render();
  broadcastState("goto");
}

function toggleFreeze() {
  state.freeze = !state.freeze;
  render();
  broadcastState("freeze");
}

function toggleBlackout() {
  state.black = !state.black;
  render();
  broadcastState("blackout");
}

function togglePointer() {
  state.pointer = !state.pointer;
  render();
  broadcastState("pointer-toggle");
}

function showOverview() {
  if (state.audience || !state.slides.length) {
    return;
  }
  state.overview = true;
  render();
}

function hideOverview() {
  state.overview = false;
  render();
}

function onPointerMove(event) {
  if (!state.pointer || !state.slides.length) {
    return;
  }
  const rect = els.currentStage.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  state.pointerPos = { x, y };
  syncPointerVisuals();
  broadcastState("pointer-move");
}

function syncPointerVisuals() {
  const hidden = !state.pointer;
  els.pointerDot.classList.toggle("hidden", hidden);
  els.audiencePointerDot.classList.toggle("hidden", hidden);
  if (hidden) {
    return;
  }
  positionPointer(els.currentStage, els.pointerDot, state.pointerPos);
  positionPointer(document.getElementById("audience-stage"), els.audiencePointerDot, state.pointerPos);
}

function positionPointer(stage, dot, pos) {
  if (!stage) {
    return;
  }
  const rect = stage.getBoundingClientRect();
  dot.style.left = `${pos.x * rect.width}px`;
  dot.style.top = `${pos.y * rect.height}px`;
}

function startPresenterResize(event) {
  if (state.audience || window.innerWidth <= 980) {
    return;
  }

  event.preventDefault();
  state.resizingSplit = true;
  applyModeLayout();
  els.presenterSplitter.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", onPresenterResizeMove);
  window.addEventListener("pointerup", stopPresenterResize);
  window.addEventListener("pointercancel", stopPresenterResize);
}

function onPresenterResizeMove(event) {
  if (!state.resizingSplit) {
    return;
  }

  const bounds = els.presenterView.getBoundingClientRect();
  const minSidebar = 280;
  const maxSidebar = Math.max(minSidebar, Math.min(720, bounds.width - 320));
  const nextWidth = clamp(bounds.right - event.clientX, minSidebar, maxSidebar);
  state.presenterSidebarWidth = Math.round(nextWidth);
  applyModeLayout();
}

function stopPresenterResize(event) {
  if (!state.resizingSplit) {
    return;
  }

  state.resizingSplit = false;
  applyModeLayout();
  if (event?.pointerId !== undefined && els.presenterSplitter.hasPointerCapture(event.pointerId)) {
    els.presenterSplitter.releasePointerCapture(event.pointerId);
  }
  window.removeEventListener("pointermove", onPresenterResizeMove);
  window.removeEventListener("pointerup", stopPresenterResize);
  window.removeEventListener("pointercancel", stopPresenterResize);
}

function onPresenterSplitterKeyDown(event) {
  if (state.audience || window.innerWidth <= 980) {
    return;
  }

  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  state.presenterSidebarWidth = clamp(state.presenterSidebarWidth + direction * 24, 280, 720);
  applyModeLayout();
}

function setTimerDuration() {
  const currentMinutes = Math.round(state.duration / 60000);
  const answer = window.prompt("Presentation duration (minutes)", String(currentMinutes));
  const numeric = Number.parseInt(answer ?? "", 10);
  if (!Number.isNaN(numeric) && numeric >= 0) {
    state.duration = numeric * 60 * 1000;
    updateTimerDisplay();
    broadcastState("timer-duration");
  }
}

function updateTimerDisplay() {
  const elapsed = state.timerRunning ? Date.now() - state.startTime : 0;
  if (state.duration > 0) {
    const remaining = state.duration - elapsed;
    els.timer.textContent = formatTime(remaining, state.showHours);
    els.timer.style.color = colorTime(elapsed);
  } else {
    els.timer.textContent = formatTime(elapsed, state.showHours);
    els.timer.style.color = "var(--text)";
  }
}

function colorTime(elapsed) {
  if (state.duration === 0) {
    return "var(--text)";
  }
  if (state.lastSlide <= 0) {
    return elapsed > state.duration ? "var(--danger)" : "var(--text)";
  }
  if (elapsed > state.duration) {
    return "var(--danger)";
  }

  const elapsedSeconds = elapsed / 1000;
  const targetSeconds = state.slide * ((state.duration / 1000) / (state.lastSlide + 1));
  if (elapsedSeconds + 60 < targetSeconds) {
    return "#86a7ff";
  }
  if (elapsedSeconds > targetSeconds + 60) {
    return "#ffb14e";
  }
  return "var(--text)";
}

function formatTime(milliseconds, showHours) {
  let remaining = milliseconds;
  let prefix = "";
  if (remaining < 0) {
    prefix = "-";
    remaining = Math.abs(remaining);
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (showHours) {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${prefix}${hours}:${minutes}:${seconds}`;
  }
  return `${prefix}${String(totalMinutes).padStart(2, "0")}:${seconds}`;
}

function setupChannel() {
  if (!state.sessionId) {
    return;
  }
  if (state.channel) {
    state.channel.close();
  }
  state.channel = new BroadcastChannel(`${VIEWER_CHANNEL_PREFIX}${state.sessionId}`);
  state.channel.addEventListener("message", onChannelMessage);
  if (state.audience) {
    state.channel.postMessage({
      type: "request-state",
      sessionId: state.sessionId,
      sender: "audience",
    });
  }
}

function onChannelMessage(event) {
  const message = event.data;
  if (!message || message.sessionId !== state.sessionId) {
    return;
  }
  if (message.sender === (state.audience ? "audience" : "presenter")) {
    return;
  }

  if (message.type === "request-state" && state.presenter) {
    broadcastState("requested");
  } else if (message.type === "state" && state.audience) {
    applyRemoteState(message.payload);
  } else if (message.type === "window-closing" && state.presenter && message.audience) {
    state.audienceWindow = null;
  }
}

function broadcastState(reason) {
  if (!state.channel || !state.sessionId || state.audience) {
    return;
  }

  state.channel.postMessage({
    type: "state",
    sessionId: state.sessionId,
    sender: "presenter",
    reason,
    payload: {
      slide: state.slide,
      lastSlide: state.lastSlide,
      freeze: state.freeze,
      black: state.black,
      pointer: state.pointer,
      pointerPos: state.pointerPos,
      duration: state.duration,
      startTime: state.startTime,
      timerRunning: state.timerRunning,
      showHours: state.showHours,
      noteFontSize: state.noteFontSize,
    },
  });
}

function applyRemoteState(payload) {
  if (!payload) {
    return;
  }
  const wasFrozen = state.freeze;
  state.lastSlide = payload.lastSlide;
  state.black = payload.black;
  state.pointer = payload.pointer;
  state.pointerPos = payload.pointerPos;
  state.duration = payload.duration;
  state.startTime = payload.startTime;
  state.timerRunning = payload.timerRunning;
  state.showHours = payload.showHours;
  state.noteFontSize = payload.noteFontSize;
  state.freeze = payload.freeze;
  if (!wasFrozen || !payload.freeze) {
    state.slide = payload.slide;
  }
  render();
}

function openAudienceWindow() {
  if (!state.sessionId) {
    setStatus("Select a PDF first");
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("audience", "1");
  url.searchParams.set("session", state.sessionId);
  const width = Math.max(960, Math.round(window.screen.availWidth * 0.7));
  const height = Math.max(540, Math.round(window.screen.availHeight * 0.7));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=no",
  ].join(",");
  state.audienceWindow = window.open(url.toString(), "pdf-webslides-audience", features);
}

function replaceUrlSession(sessionId, audience) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  if (audience) {
    url.searchParams.set("audience", "1");
  } else {
    url.searchParams.delete("audience");
  }
  window.history.replaceState({}, "", url);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function showLoading(label, detail, progress = 0) {
  els.loadingOverlay.classList.remove("hidden");
  setLoadingProgress(label, detail, progress);
}

function hideLoading() {
  els.loadingOverlay.classList.add("hidden");
}

function setLoadingProgress(label, detail, progress) {
  els.loadingLabel.textContent = label;
  els.loadingDetail.textContent = detail;
  els.loadingBarFill.style.width = `${clamp(progress, 0, 100)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createSessionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveSessionPdf(id, bytes, name) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put({
      id,
      name,
      bytes,
      updatedAt: Date.now(),
    });
  });
  db.close();
}

async function loadSessionPdf(id) {
  const db = await openDatabase();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
  db.close();
  return result;
}
