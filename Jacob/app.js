// ── Constants ──
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CAPTURE_WIDTH = 640;
const MAX_CAPTURE_HEIGHT = 480;

// ── State ──
const state = {
  apiProvider: 'claude',
  apiKey: '',
  genrePrefs: '',
  danceMode: 'match',
  webcamVisible: true,
};

function loadState() {
  state.apiProvider = localStorage.getItem('vibe_apiProvider') || 'claude';
  state.apiKey = localStorage.getItem('vibe_apiKey') || '';
  state.genrePrefs = localStorage.getItem('vibe_genrePrefs') || '';
  state.danceMode = localStorage.getItem('vibe_danceMode') || 'match';
  state.webcamVisible = localStorage.getItem('vibe_webcamVisible') !== 'false';
}

function saveState(key, value) {
  state[key] = value;
  localStorage.setItem('vibe_' + key, value);
}

// ── DOM refs ──
let els = {};

function cacheDom() {
  els = {
    settingsOpen: document.getElementById('settingsOpen'),
    settingsClose: document.getElementById('settingsClose'),
    settings: document.getElementById('settings'),
    apiProvider: document.getElementById('apiProvider'),
    apiKey: document.getElementById('apiKey'),
    keyToggle: document.getElementById('keyToggle'),
    genrePrefs: document.getElementById('genrePrefs'),
    danceModes: document.querySelectorAll('.dance-mode'),
    webcamToggle: document.getElementById('webcamToggle'),
    webcamContainer: document.getElementById('webcamContainer'),
    webcam: document.getElementById('webcam'),
    canvas: document.getElementById('captureCanvas'),
    checkVibe: document.getElementById('checkVibe'),
    status: document.getElementById('status'),
    loader: document.getElementById('loader'),
    errorDisplay: document.getElementById('errorDisplay'),
    vibeDescription: document.getElementById('vibeDescription'),
    playerContainer: document.getElementById('playerContainer'),
  };
}

// ── Settings ──
function initSettings() {
  loadState();

  els.apiProvider.value = state.apiProvider;
  els.apiKey.value = state.apiKey;
  els.genrePrefs.value = state.genrePrefs;
  els.webcamToggle.checked = state.webcamVisible;
  updateWebcamVisibility();

  // Highlight active dance mode
  els.danceModes.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.danceMode);
  });

  // Listeners
  els.apiProvider.addEventListener('change', e => saveState('apiProvider', e.target.value));
  els.apiKey.addEventListener('input', e => saveState('apiKey', e.target.value));
  els.genrePrefs.addEventListener('input', e => saveState('genrePrefs', e.target.value));

  els.danceModes.forEach(btn => {
    btn.addEventListener('click', () => {
      els.danceModes.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveState('danceMode', btn.dataset.mode);
    });
  });

  els.webcamToggle.addEventListener('change', e => {
    saveState('webcamVisible', e.target.checked);
    updateWebcamVisibility();
  });

  els.keyToggle.addEventListener('click', () => {
    const input = els.apiKey;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  els.settingsOpen.addEventListener('click', () => els.settings.classList.add('open'));
  els.settingsClose.addEventListener('click', () => els.settings.classList.remove('open'));
}

function updateWebcamVisibility() {
  els.webcamContainer.classList.toggle('hidden-cam', !state.webcamVisible);
}

// ── Webcam ──
let webcamStream = null;

async function initWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    els.webcam.srcObject = webcamStream;
  } catch (err) {
    showError('Camera access denied or unavailable. Grant permission and reload to use the vibe checker.');
  }
}

function captureFrame() {
  const video = els.webcam;
  if (!video.srcObject || video.videoWidth === 0) {
    throw new Error('Webcam not ready yet. Wait a moment and try again.');
  }

  const canvas = els.canvas;
  // Cap resolution to keep payload small
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (w > MAX_CAPTURE_WIDTH) {
    h = Math.round(h * (MAX_CAPTURE_WIDTH / w));
    w = MAX_CAPTURE_WIDTH;
  }
  if (h > MAX_CAPTURE_HEIGHT) {
    w = Math.round(w * (MAX_CAPTURE_HEIGHT / h));
    h = MAX_CAPTURE_HEIGHT;
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  return dataUrl.split(',')[1]; // raw base64
}

// ── Prompt Builder ──
function buildPrompt() {
  const genres = state.genrePrefs.trim() || 'any genre';

  const modeDescriptions = {
    match: 'Match Energy — pick a song whose energy matches what you detect in the room.',
    keep: 'Keep the Vibe — pick a song that maintains the current mood without disrupting it.',
    escalate: 'Escalate — pick a song that pushes the energy higher than what you detect.',
  };

  return `You are a party DJ AI with a webcam pointed at the room. Analyze this image and recommend a song.

ANALYZE:
1. SCENE: Describe the environment — lighting, colors, setting (party, living room, office, outdoors, bar, etc.)
2. PEOPLE & ENERGY: Describe the people — how many, their expressions, body language, dancing patterns, movement style. Rate energy 1-10.
3. VIBE: One sentence capturing the overall vibe.

RECOMMEND A SONG based on your analysis:
- Genre preferences: ${genres}
- Dance mode: ${modeDescriptions[state.danceMode]}
- Pick a real, well-known song that fits. Be creative and specific.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "scene": "brief scene description",
  "energy_level": 7,
  "emotions": "what you read from the people",
  "dance_style": "description of any dancing or movement",
  "vibe": "one-sentence vibe summary",
  "song_title": "Song Name",
  "song_artist": "Artist Name",
  "why": "one sentence on why this song fits the vibe",
  "youtube_query": "Artist Name Song Name"
}`;
}

// ── API Calls ──
async function callAnthropicAPI(base64Image, prompt) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return parseAIResponse(data.content[0].text);
}

async function callOpenAIAPI(base64Image, prompt) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return parseAIResponse(data.choices[0].message.content);
}

function parseAIResponse(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('AI returned an invalid response. Try again.');
  }
}

// ── Display Results ──
function displayVibeResult(result) {
  const energyPct = Math.max(0, Math.min(100, (result.energy_level || 5) * 10));

  els.vibeDescription.innerHTML = `
    <div class="vibe-label">The Vibe</div>
    <div class="vibe-main">${escapeHtml(result.vibe || 'Unknown vibe')}</div>
    <div class="vibe-label">Energy</div>
    <div class="energy-bar"><div class="energy-fill" style="width: ${energyPct}%"></div></div>
    <div class="vibe-detail">${escapeHtml(result.scene || '')}</div>
    <div class="vibe-detail">${escapeHtml(result.emotions || '')}</div>
    ${result.dance_style ? `<div class="vibe-detail">${escapeHtml(result.dance_style)}</div>` : ''}
    <div class="vibe-song">
      <strong>${escapeHtml(result.song_title || '?')} &mdash; ${escapeHtml(result.song_artist || '?')}</strong>
      <br><small>${escapeHtml(result.why || '')}</small>
    </div>
  `;
  els.vibeDescription.classList.remove('hidden');
}

function showPlayButtons(query, title, artist) {
  const encoded = encodeURIComponent(query || `${title} ${artist}`);
  const ytUrl = `https://www.youtube.com/results?search_query=${encoded}`;
  const spotifyUrl = `https://open.spotify.com/search/${encoded}`;

  els.playerContainer.innerHTML = `
    <div class="play-buttons">
      <a href="${ytUrl}" target="_blank" rel="noopener" class="play-btn play-yt">
        &#9654; Play on YouTube
      </a>
      <a href="${spotifyUrl}" target="_blank" rel="noopener" class="play-btn play-spotify">
        &#9654; Play on Spotify
      </a>
    </div>
  `;
  els.playerContainer.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Loading & Errors ──
function setLoading(on) {
  els.checkVibe.disabled = on;
  els.loader.classList.toggle('hidden', !on);
}

function showError(msg) {
  els.errorDisplay.textContent = msg;
  els.errorDisplay.classList.remove('hidden');
}

function hideError() {
  els.errorDisplay.classList.add('hidden');
}

// ── Countdown Timer ──
let countdownInterval = null;
let nextCheckTime = null;

function resetCountdown() {
  clearInterval(countdownInterval);
  nextCheckTime = Date.now() + DEFAULT_INTERVAL_MS;

  countdownInterval = setInterval(() => {
    const remaining = nextCheckTime - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      analyzeVibe();
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    els.status.textContent = `Next vibe check in ${mins}:${secs.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopCountdown() {
  clearInterval(countdownInterval);
  countdownInterval = null;
  nextCheckTime = null;
}

// ── Main Orchestrator ──
async function analyzeVibe() {
  if (!state.apiKey) {
    showError('Enter your API key in Settings first.');
    els.settings.classList.add('open');
    return;
  }

  hideError();
  setLoading(true);
  stopCountdown();
  els.status.textContent = 'Reading the room...';

  try {
    const base64 = captureFrame();
    const prompt = buildPrompt();

    let result;
    if (state.apiProvider === 'claude') {
      result = await callAnthropicAPI(base64, prompt);
    } else {
      result = await callOpenAIAPI(base64, prompt);
    }

    displayVibeResult(result);
    showPlayButtons(result.youtube_query, result.song_title, result.song_artist);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
    resetCountdown();
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  initSettings();
  initWebcam();
  els.checkVibe.addEventListener('click', analyzeVibe);
});
