// --- Service: Dictionary & Cache ---
class DictionaryService {
  static storageKey = 'r2_cache';

  static get cache() {
    return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
  }

  static set cache(v) {
    localStorage.setItem(this.storageKey, JSON.stringify(v));
  }

  static async lookup(word) {
    const key = word.toLowerCase();
    const cache = this.cache;
    if (cache[key]) return cache[key];

    let definition = 'No def';
    let translation = '—';

    try {
      let d = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${key}`)
        .then(r => r.json());
      definition = d[0]?.meanings[0]?.definitions[0]?.definition || definition;
    } catch {}

    try {
      let t = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${key}`)
        .then(r => r.json());
      translation = t[0][0][0] || translation;
    } catch {}

    cache[key] = { definition, translation };
    this.cache = cache;
    return { definition, translation };
  }
}

// --- UI & App Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const fileInput      = document.getElementById('file-input');
  const textInput      = document.getElementById('text-input');
  const loadBtn        = document.getElementById('load-btn');
  const reader         = document.getElementById('reader');
  const textEl         = document.getElementById('text');
  const backBtn        = document.getElementById('back-btn');
  const popup          = document.getElementById('popup');
  const savedList      = document.getElementById('saved-list');
  const themeToggle    = document.getElementById('theme-toggle');
  const fontSizeSelect = document.getElementById('font-size');
  const ttsBtn         = document.getElementById('tts-play');
  const ttsRate        = document.getElementById('tts-rate');

  let saved = new Set(
    JSON.parse(localStorage.getItem('r2_words') || '[]')
      .map(w => w.toLowerCase())
  );
  let utterance = null;
  let lastSource = null;

  fileInput.addEventListener('change', () => lastSource = 'file');
  textInput.addEventListener('input', () => lastSource = 'text');

  themeToggle.onclick = () => {
    const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = next;
    themeToggle.textContent = next === 'light' ? 'Dark' : 'Light';
  };

  fontSizeSelect.onchange = e =>
    document.documentElement.style.setProperty('--font-size', e.target.value + 'rem');

  function saveWords() {
    localStorage.setItem('r2_words', JSON.stringify([...saved]));
  }

  function renderSaved() {
    savedList.innerHTML = '';
    saved.forEach(w => {
      const span = document.createElement('span');
      span.className = 'saved-word';
      span.textContent = w;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.onclick = () => {
        saved.delete(w);
        saveWords();
        renderText(textEl.textContent);
        renderSaved();
      };
      span.appendChild(btn);
      savedList.appendChild(span);
    });
    highlightSaved();
  }

  function renderText(raw) {
    textEl.innerHTML = '';
    raw.split(/(\s+)/).forEach(chunk => {
      if (/\w+/.test(chunk)) {
        const clean = chunk.replace(/[^\w]/g, '');
        const span = document.createElement('span');
        span.className = 'word';
        span.tabIndex = 0;
        span.setAttribute('aria-label', clean);
        span.textContent = chunk;
        span.onclick    = () => showPopup(span, clean);
        span.onkeypress = e => e.key === 'Enter' && showPopup(span, clean);
        textEl.appendChild(span);
      } else {
        textEl.appendChild(document.createTextNode(chunk));
      }
    });
    highlightSaved();
  }

  function highlightSaved() {
    document.querySelectorAll('.word').forEach(w => {
      const clean = w.textContent.replace(/[^\w]/g, '').toLowerCase();
      w.classList.toggle('highlight', saved.has(clean));
    });
  }

  async function showPopup(el, word) {
    const { definition, translation } = await DictionaryService.lookup(word);
    popup.innerHTML = `
      <strong>${word}</strong>
      <p>${definition}</p>
      <strong>TR:</strong> ${translation}
      <div class="controls">
        <button id="save-btn" class="btn">${saved.has(word) ? 'Unsave' : 'Save'}</button>
        <button id="close-btn" class="btn">Close</button>
      </div>
    `;
    const { top, left } = el.getBoundingClientRect();
    popup.style.top  = `${top + window.scrollY + 20}px`;
    popup.style.left = `${left + window.scrollX}px`;
    popup.classList.remove('hidden');

    document.getElementById('save-btn').onclick = () => {
      const key = word.toLowerCase();
      saved.has(key) ? saved.delete(key) : saved.add(key);
      saveWords();
      renderSaved();
      highlightSaved();
      popup.classList.add('hidden');
    };

    document.getElementById('close-btn').onclick = () =>
      popup.classList.add('hidden');
  }

  function playTTS() {
    if (utterance) {
      speechSynthesis.cancel();
      utterance = null;
      ttsBtn.textContent = 'Play TTS';
      return;
    }
    utterance = new SpeechSynthesisUtterance(textEl.textContent);
    utterance.rate = parseFloat(ttsRate.value);
    speechSynthesis.speak(utterance);
    ttsBtn.textContent = 'Stop TTS';
  }

  ttsBtn.onclick = playTTS;

  // Back butonu: reader → library, plus clear inputs
  backBtn.onclick = () => {
    reader.classList.add('hidden');
    document.getElementById('library').classList.remove('hidden');
    popup.classList.add('hidden');

    // Sıfırla
    fileInput.value = '';
    textInput.value = '';
    lastSource = null;
  };

  loadBtn.onclick = async () => {
    const file   = fileInput.files[0];
    const pasted = textInput.value.trim();

    if (!file && !pasted) {
      alert('Please select a file or paste some text.');
      return;
    }

    document.getElementById('library').classList.add('hidden');
    reader.classList.remove('hidden');
    popup.classList.add('hidden');

    if (lastSource === 'text' && pasted) {
      document.getElementById('pdf-viewer').classList.add('hidden');
      document.getElementById('epub-viewer').classList.add('hidden');
      renderText(pasted);
      renderSaved();
      return;
    }

    if (lastSource === 'file' && file) {
      await handleFile(file);
      renderSaved();
      return;
    }

    if (pasted) {
      document.getElementById('pdf-viewer').classList.add('hidden');
      document.getElementById('epub-viewer').classList.add('hidden');
      renderText(pasted);
    } else {
      await handleFile(file);
    }
    renderSaved();
  };

  async function handleFile(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf')) {
      const url = URL.createObjectURL(file);
      const pdfjs = window['pdfjs-dist/build/pdf'];
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
      const pdf  = await pdfjs.getDocument(url).promise;
      document.getElementById('pdf-viewer').classList.remove('hidden');
      const canvas = document.createElement('canvas');
      const page   = await pdf.getPage(1);
      const vp     = page.getViewport({ scale: 1.2 });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const vd = document.getElementById('pdf-viewer');
      vd.innerHTML = '';
      vd.append(canvas);
      textEl.textContent = 'PDF preview above.';

    } else if (name.endsWith('.epub')) {
      document.getElementById('epub-viewer').classList.remove('hidden');
      const book      = ePub(file);
      const rendition = book.renderTo('epub-viewer', { width: '100%', height: 400 });
      rendition.display();
      textEl.textContent = 'EPUB preview above.';

    } else {
      const txt = await file.text();
      document.getElementById('pdf-viewer').classList.add('hidden');
      document.getElementById('epub-viewer').classList.add('hidden');
      renderText(txt);
    }
  }

  renderSaved();
});
