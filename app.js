// ============================================================
// chemdoomscroller — feed engine
// ============================================================

const DATA_ROOT = "questions/";
const STORAGE = {
  filters: "chemdoom.filters",
  streak: "chemdoom.streak",
  answered: "chemdoom.answered",
  theme: "chemdoom.theme",
};

const state = {
  index: null,
  questionPool: [],     // flat list of {unitName, topicName, file} pointers from active filters
  questionCache: new Map(),  // path -> question object
  served: new Set(),    // paths already shown this session
  streak: 0,
  currentCard: null,
  activeFilters: null,  // Set of topic paths, null = all
};

// ============================================================
// boot
// ============================================================
async function boot() {
  loadTheme();
  loadStreak();
  try {
    const res = await fetch("index.json");
    state.index = await res.json();
  } catch (e) {
    showError("couldn't load index.json");
    return;
  }
  loadFilters();
  buildPool();
  buildFilterUI();
  attachThemeToggle();
  // render first batch
  appendQuestions(5);
  attachScrollObserver();
}

// ============================================================
// pool building — every filter change rebuilds this
// ============================================================
function buildPool() {
  state.questionPool = [];
  for (const unit of state.index.units) {
    for (const topic of unit.topics) {
      if (state.activeFilters && !state.activeFilters.has(topic.path)) continue;
      for (const file of topic.files) {
        state.questionPool.push({
          unitName: unit.name,
          topicName: topic.name,
          path: `${topic.path}/${file}`,
        });
      }
    }
  }
  // fisher-yates shuffle so order is random per session
  for (let i = state.questionPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.questionPool[i], state.questionPool[j]] = [state.questionPool[j], state.questionPool[i]];
  }
}

// ============================================================
// pick a random unseen question
// ============================================================
function pickNext() {
  // find next pool entry not yet served
  for (const entry of state.questionPool) {
    if (!state.served.has(entry.path)) {
      state.served.add(entry.path);
      return entry;
    }
  }
  // pool exhausted — reset and reshuffle
  state.served.clear();
  buildPool();
  if (state.questionPool.length === 0) return null;
  const first = state.questionPool[0];
  state.served.add(first.path);
  return first;
}

// ============================================================
// fetch question json (with cache)
// ============================================================
async function fetchQuestion(entry) {
  if (state.questionCache.has(entry.path)) {
    return state.questionCache.get(entry.path);
  }
  try {
    const res = await fetch(entry.path);
    const data = await res.json();
    state.questionCache.set(entry.path, data);
    return data;
  } catch (e) {
    console.error("Failed to fetch", entry.path, e);
    return null;
  }
}

// ============================================================
// render
// ============================================================
async function appendQuestions(n) {
  const feed = document.getElementById("feed");
  for (let i = 0; i < n; i++) {
    const entry = pickNext();
    if (!entry) break;
    const data = await fetchQuestion(entry);
    if (!data) continue;
    // skip placeholders (empty question text)
    const questionText = data.question || data.q;
    if (!questionText || questionText.trim() === "") {
      // still render a placeholder card so the structure is visible
      feed.appendChild(buildCard(entry, {
        question: "(placeholder — add question to " + entry.path + ")",
        options: ["—", "—", "—", "—"],
        answer: 0,
        explanation: "fill in this JSON file with a real question, 4 options, the index of the correct answer, and an explanation.",
      }, true));
      continue;
    }
    feed.appendChild(buildCard(entry, data, false));
  }
}

function buildCard(entry, data, isPlaceholder) {
  const card = document.createElement("section");
  card.className = "reel q-card";
  card.dataset.path = entry.path;

  const letters = ["A", "B", "C", "D"];
  let optionsArray;

  if (Array.isArray(data.options)) {
    optionsArray = data.options;
  } else if (typeof data.options === "object" && data.options !== null) {
    optionsArray = letters.map(l => data.options[l] || "");
  } else {
    optionsArray = ["—", "—", "—", "—"];
  }

  const optionsHtml = optionsArray.map((opt, i) => `
    <button class="option" data-idx="${i}">
      <span class="letter">${letters[i]}</span>
      <span>${escapeHtml(opt)}</span>
    </button>
  `).join("");

  const captionText = "Japan is turning footsteps into electricity! 🔋 Using piezoelectric tiles, every step you take generates a small amount of energy. Millions of steps together can power LED lights and displays in busy places like Shibuya Station. A brilliant way to create a sustainable and smart city";
  const questionText = data.question || data.q;

  card.innerHTML = `
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="heart-icon" viewBox="0 0 512 512"><path d="M256 448a32 32 0 01-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8-40-48.75-59.15-98.8-58.61-153C48.63 114.52 98.46 64 159.08 64c44.08 0 74.61 24.83 92.39 45.51a6 6 0 009.06 0C278.31 88.81 308.84 64 352.92 64c60.62 0 110.45 50.52 111.08 112.64.54 54.21-18.63 104.26-58.61 153-18.77 22.87-52.8 59.45-131.39 112.8a32 32 0 01-18 5.56z"/></svg>

    <div class="overlay">
      <div class="top">
        <div class="topic-tag">${escapeHtml(entry.topicName)}</div>
        <div class="q-number">${entry.path.split("/").pop().replace(".json","").toUpperCase()}</div>
        <h2 class="q-text">${escapeHtml(questionText)}</h2>
        <div class="options">${optionsHtml}</div>
      </div>

      <article class="meta_container">
        <div class="author">
          <figure class="figure avatar-initials" aria-hidden="true">Cl</figure>
          <div class="author_artist-container">
            <div class="reel_author">chemdoom</div>
            <button type="button" class="follow_btn">Follow</button>
          </div>
        </div>
        <div class="caption">
          <p class="caption-text caption-collapsed">${escapeHtml(captionText)}</p>
          <button type="button" class="caption-expand-btn">more</button>
        </div>
      </article>

      <aside class="meta_sidebar">
        <div class="hearts meta_count-container">
          <span class="access-hidden">Number of Likes</span>
          <button type="button" class="heart_button" aria-label="Like">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 448a32 32 0 01-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8-40-48.75-59.15-98.8-58.61-153C48.63 114.52 98.46 64 159.08 64c44.08 0 74.61 24.83 92.39 45.51a6 6 0 009.06 0C278.31 88.81 308.84 64 352.92 64c60.62 0 110.45 50.52 111.08 112.64.54 54.21-18.63 104.26-58.61 153-18.77 22.87-52.8 59.45-131.39 112.8a32 32 0 01-18 5.56z"/></svg>
          </button>
          <div class="meta_count likes-count">0</div>
        </div>
        <div class="comments meta_count-container">
          <span class="access-hidden">Number of Comments</span>
          <button type="button" aria-label="Comment">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M87.49 380c1.19-4.38-1.44-10.47-3.95-14.86a44.86 44.86 0 00-2.54-3.8 199.81 199.81 0 01-33-110C47.65 139.09 140.73 48 255.83 48 356.21 48 440 117.54 459.58 209.85a199 199 0 014.42 41.64c0 112.41-89.49 204.93-204.59 204.93-18.3 0-43-4.6-56.47-8.37s-26.92-8.77-30.39-10.11a31.09 31.09 0 00-11.12-2.07 30.71 30.71 0 00-12.09 2.43l-67.83 24.48a16 16 0 01-4.67 1.22 9.6 9.6 0 01-9.57-9.74 15.85 15.85 0 01.6-3.29z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32"/></svg>
          </button>
          <div class="meta_count">6</div>
        </div>
        <div class="remix meta_count-container">
          <span class="access-hidden">Share</span>
          <button type="button" aria-label="Share">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M320 120l48 48-48 48"/><path d="M352 168H144a80.24 80.24 0 00-80 80v16M192 392l-48-48 48-48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path d="M160 344h208a80.24 80.24 0 0080-80v-16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>
          </button>
        </div>
        <div class="send meta_count-container">
          <span class="access-hidden">Send</span>
          <button type="button" aria-label="Send">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M448 64L64 240.14h200a8 8 0 018 8V448z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>
          </button>
        </div>
        <div class="ellipsis meta_count-container">
          <span class="access-hidden">More</span>
          <button type="button" aria-label="More options">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="48"/><circle cx="416" cy="256" r="48"/><circle cx="96" cy="256" r="48"/></svg>
          </button>
        </div>
      </aside>
    </div>
  `;

  card.querySelectorAll(".option").forEach(btn => {
    btn.addEventListener("click", () => handleAnswer(card, btn, data));
  });

  const captionEl = card.querySelector(".caption-text");
  const expandBtn = card.querySelector(".caption-expand-btn");
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    captionEl.classList.toggle("caption-collapsed");
    expandBtn.textContent = captionEl.classList.contains("caption-collapsed") ? "more" : "less";
  });

  return card;
}

function handleAnswer(card, btn, data) {
  const picked = parseInt(btn.dataset.idx);
  // Convert answer letter (A, B, C, D) to index if needed
  let correctIdx = data.answer;
  if (typeof correctIdx === "string" && correctIdx.length === 1) {
    correctIdx = correctIdx.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
  }
  const isCorrect = picked === correctIdx;

  // lock all options and mark them
  card.querySelectorAll(".option").forEach((b, i) => {
    b.classList.add("locked");
    if (i === correctIdx) b.classList.add("correct");
    else if (i === picked) b.classList.add("wrong");
  });

  // haptic
  if (navigator.vibrate) {
    navigator.vibrate(isCorrect ? 12 : [10, 50, 10]);
  }

  // streak
  if (isCorrect) {
    state.streak++;
  } else {
    state.streak = 0;
  }
  saveStreak();
  updateStreakUI();

  // show feedback sheet
  showFeedback(isCorrect, data.explanation);
}

// ============================================================
// feedback sheet
// ============================================================
function showFeedback(isCorrect, explanation) {
  const sheet = document.getElementById("feedbackSheet");
  const tag = document.getElementById("feedbackTag");
  const exp = document.getElementById("feedbackExplanation");
  tag.textContent = isCorrect ? "CORRECT" : "INCORRECT";
  tag.className = "feedback-tag " + (isCorrect ? "correct" : "wrong");
  exp.textContent = explanation || "";
  openSheet(sheet);
}

document.getElementById("nextBtn").addEventListener("click", () => {
  closeSheet(document.getElementById("feedbackSheet"));
  // scroll feed forward by one card height
  const feed = document.getElementById("feed");
  feed.scrollBy({ top: window.innerHeight, behavior: "smooth" });
});

// ============================================================
// sheets — generic open/close
// ============================================================
function openSheet(sheet) {
  document.getElementById("scrim").classList.add("open");
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}
function closeSheet(sheet) {
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  // close scrim only if no sheet open
  const anyOpen = document.querySelectorAll(".sheet.open").length > 0;
  if (!anyOpen) document.getElementById("scrim").classList.remove("open");
}
document.getElementById("scrim").addEventListener("click", () => {
  document.querySelectorAll(".sheet.open").forEach(s => closeSheet(s));
});

// booklet
document.getElementById("bookletBtn").addEventListener("click", () => {
  openSheet(document.getElementById("bookletSheet"));
});
document.querySelectorAll(".booklet-tabs .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".booklet-tabs .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.tab-content[data-content="${tab.dataset.tab}"]`).classList.add("active");
  });
});

// filter
document.getElementById("filterBtn").addEventListener("click", () => {
  openSheet(document.getElementById("filterSheet"));
});
document.getElementById("applyFilterBtn").addEventListener("click", () => {
  const checked = document.querySelectorAll("#filterBody input[type=checkbox]:checked");
  if (checked.length === 0) {
    state.activeFilters = null;
  } else {
    state.activeFilters = new Set(Array.from(checked).map(c => c.value));
  }
  saveFilters();
  // reset feed
  resetFeed();
  closeSheet(document.getElementById("filterSheet"));
});

function buildFilterUI() {
  const body = document.getElementById("filterBody");
  body.innerHTML = "";
  for (const unit of state.index.units) {
    const wrap = document.createElement("div");
    wrap.className = "filter-unit";
    wrap.innerHTML = `<div class="filter-unit-name">${escapeHtml(unit.name)}</div>`;
    for (const topic of unit.topics) {
      const id = "f_" + topic.path.replace(/[^a-z0-9]/gi, "_");
      const checked = !state.activeFilters || state.activeFilters.has(topic.path);
      const row = document.createElement("label");
      row.className = "filter-topic";
      row.innerHTML = `
        <input type="checkbox" id="${id}" value="${topic.path}" ${checked ? "checked" : ""}>
        <span>${escapeHtml(topic.name)}</span>
      `;
      wrap.appendChild(row);
    }
    body.appendChild(wrap);
  }
}

function resetFeed() {
  const feed = document.getElementById("feed");
  // keep only the splash card (first child)
  while (feed.children.length > 1) feed.removeChild(feed.lastChild);
  state.served.clear();
  buildPool();
  feed.scrollTo({ top: 0, behavior: "instant" });
  appendQuestions(5);
}

// ============================================================
// infinite scroll observer
// ============================================================
function attachScrollObserver() {
  const feed = document.getElementById("feed");
  feed.addEventListener("scroll", () => {
    const scrollPos = feed.scrollTop;
    const viewportH = window.innerHeight;
    const totalH = feed.scrollHeight;
    // when within 2 cards of bottom, append more
    if (totalH - (scrollPos + viewportH) < viewportH * 2) {
      // throttle: only append if not already appending
      if (!state.appending) {
        state.appending = true;
        appendQuestions(3).then(() => { state.appending = false; });
      }
    }
    // update progress (active card index / pool length)
    const idx = Math.floor(scrollPos / viewportH);
    const total = Math.min(state.questionPool.length, state.served.size);
    const pct = total > 0 ? (idx / total) * 100 : 0;
    document.getElementById("progressFill").style.width = Math.min(pct, 100) + "%";
  }, { passive: true });
}

// ============================================================
// persistence
// ============================================================
function loadTheme() {
  const theme = localStorage.getItem(STORAGE.theme) || "dark";
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = theme === "light";
}

function saveTheme(isLight) {
  localStorage.setItem(STORAGE.theme, isLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
}

function attachThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      saveTheme(e.target.checked);
    });
  }
}

function loadStreak() {
  state.streak = parseInt(localStorage.getItem(STORAGE.streak) || "0");
  updateStreakUI();
}
function saveStreak() {
  localStorage.setItem(STORAGE.streak, state.streak.toString());
}
function updateStreakUI() {
  document.getElementById("streakNum").textContent = state.streak;
}

function loadFilters() {
  const raw = localStorage.getItem(STORAGE.filters);
  if (!raw) { state.activeFilters = null; return; }
  try {
    const arr = JSON.parse(raw);
    state.activeFilters = arr.length ? new Set(arr) : null;
  } catch { state.activeFilters = null; }
}
function saveFilters() {
  if (!state.activeFilters) {
    localStorage.removeItem(STORAGE.filters);
    return;
  }
  localStorage.setItem(STORAGE.filters, JSON.stringify(Array.from(state.activeFilters)));
}

// ============================================================
// util
// ============================================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showError(msg) {
  const feed = document.getElementById("feed");
  feed.innerHTML = `<section class="card"><div style="margin:auto;text-align:center;color:var(--ink-dim);font-family:var(--font-mono);font-size:14px;">${escapeHtml(msg)}</div></section>`;
}

boot();
