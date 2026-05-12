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
  card.className = "card q-card";
  card.dataset.path = entry.path;

  const letters = ["A", "B", "C", "D"];
  let optionsArray;

  // Handle both array and object formats for options
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
    <div class="reels-container">
      <!-- Left profile section -->
      <div class="profile-section">
        <div class="profile-avatar">Cl</div>
        <div class="profile-info">
          <div class="profile-name">chemdoom</div>
          <button class="follow-btn">Follow</button>
        </div>
      </div>

      <!-- Main content -->
      <div class="reels-content">
        <div class="topic-tag">${escapeHtml(entry.topicName)}</div>
        <div class="q-number">${entry.path.split("/").pop().replace(".json","").toUpperCase()}</div>
        <h2 class="q-text">${escapeHtml(questionText)}</h2>
        <div class="options">${optionsHtml}</div>
      </div>

      <!-- Right sidebar with actions -->
      <div class="reels-sidebar">
        <button class="action-btn" aria-label="like">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="action-count">42</span>
        </button>
        <button class="action-btn" aria-label="comment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="action-count">18</span>
        </button>
        <button class="action-btn" aria-label="share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span class="action-count">7</span>
        </button>
        <button class="action-btn" aria-label="bookmark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10l5 5v11a2 2 0 0 1-2 2z"/></svg>
          <span class="action-count">12</span>
        </button>
      </div>

      <!-- Bottom caption -->
      <div class="reels-caption">
        <div class="caption-container">
          <div class="caption-text caption-collapsed">${escapeHtml(captionText)}</div>
          <button class="caption-expand-btn" aria-label="expand caption">more</button>
        </div>
      </div>
    </div>
  `;

  card.querySelectorAll(".option").forEach(btn => {
    btn.addEventListener("click", () => handleAnswer(card, btn, data));
  });

  // Caption expand/collapse
  const captionText_el = card.querySelector(".caption-text");
  const expandBtn = card.querySelector(".caption-expand-btn");
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    captionText_el.classList.toggle("caption-collapsed");
    expandBtn.textContent = captionText_el.classList.contains("caption-collapsed") ? "more" : "less";
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
