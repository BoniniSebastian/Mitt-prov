// Mitt prov – frontend-only
// Regel: Rätt svar måste skrivas exakt som "- *Rätt svar"

const el = (id) => document.getElementById(id);

// ===== DOM =====
const inputText = el("inputText");
const loadBtn = el("loadBtn");
const shareLinkBtn = el("shareLinkBtn");
const exampleBtn = el("exampleBtn");
const clearBtn = el("clearBtn");

const quizCard = el("quizCard");
const quizTitle = el("quizTitle");
const quizContainer = el("quizContainer");
const submitBtn = el("submitBtn");
const parseError = el("parseError");
const appTitle = el("appTitle");

// Overlay
const resultOverlay = el("resultOverlay");
const overlayResult = el("overlayResult");
const overlayRedoBtn = el("overlayRedoBtn");
const overlayWrongBtn = el("overlayWrongBtn");
const overlayNewBtn = el("overlayNewBtn");
const overlayCloseBtn = el("overlayCloseBtn");

// AI prompt UI
const qCountEl = el("qCount");
const optCountEl = el("optCount");
const copyPromptBtn = el("copyPromptBtn");
const copyStatus = el("copyStatus");
const promptBox = el("promptBox");
const selectPromptBtn = el("selectPromptBtn");

// ===== STATE =====
let currentQuiz = null;
let viewQuiz = null;
let lastGrade = null;

// ===== HELPERS =====
function showError(msg) {
  parseError.textContent = msg;
  parseError.classList.remove("hidden");
}
function hideError() {
  parseError.classList.add("hidden");
  parseError.textContent = "";
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
function resetUI() {
  currentQuiz = null;
  viewQuiz = null;
  lastGrade = null;
  quizCard.classList.add("hidden");
  quizContainer.innerHTML = "";
  hideError();
  appTitle.textContent = "Mitt prov";
}

// ===== AI PROMPT (MATCHAR PARSERN EXAKT) =====
function buildPrompt(numQuestions, numOptions) {
  const third = numOptions === 3 ? "- <svar C>\n" : "";
  return `Du är en provgenerator.

Jag kommer bifoga 1–10 bilder/foton (t.ex. sidor ur en bok/arbetsblad).
Skapa ett prov baserat ENDAST på innehållet i bilderna.

FORMAT (VIKTIGT – följ exakt):

TEST: <kort titel>

Q: <fråga 1>
- <fel svar A>
- *<rätt svar>
${third}

REGLER:
- Varje fråga måste börja med "Q:"
- Varje svarsalternativ måste börja med "- "
- Endast det rätta svaret får skrivas som "- *Rätt svar"
- Alla andra svar ska vara "- Fel svar"
- Exakt ${numQuestions} frågor
- Exakt ${numOptions} svar per fråga
- Inget annat än detta format
- Inga förklaringar, inga rubriker, ingen markdown

BÖRJA NU.`;
}

// ===== SMART COPY =====
async function copyTextSmart(text, textarea) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    if (textarea) {
      textarea.value = text;
      textarea.focus();
      textarea.select();
    }
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

// ===== PARSER =====
function parseQuiz(raw) {
  const lines = raw.replace(/\r\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error("Ingen text att parsa.");

  const isTitle = l => l.toUpperCase().startsWith("TEST:");
  const isQuestion = l => l.toUpperCase().startsWith("Q:") || l.endsWith("?");

  let title = "Prov";
  let i = 0;

  if (isTitle(lines[i])) {
    title = lines[i].slice(5).trim() || title;
    i++;
  }

  const questions = [];

  while (i < lines.length) {
    if (!isQuestion(lines[i])) {
      throw new Error(`Förväntade fråga men fick: "${lines[i]}"`);
    }

    const qText = lines[i].replace(/^Q:/i, "").trim();
    i++;

    const opts = [];
    let correctIndex = -1;

    while (i < lines.length && !isQuestion(lines[i]) && !isTitle(lines[i])) {
      const rawLine = lines[i];

      const isCorrect = /^(-|•|–|—)\s*\*/.test(rawLine);

      let line = rawLine
        .replace(/^\d+[\.\)]\s+/, "")
        .replace(/^(-|•|–|—)\s*/, "");

      if (isCorrect) line = line.replace(/^\*\s*/, "");

      line = line.trim();

      if (!line) throw new Error(`Tomt svar i frågan "${qText}"`);

      if (isCorrect) {
        if (correctIndex !== -1) {
          throw new Error(
            `Flera rätta svar i frågan "${qText}". Endast ett får vara "- *Rätt svar".`
          );
        }
        correctIndex = opts.length;
      }

      opts.push(line);
      i++;
    }

    if (opts.length < 2 || opts.length > 3) {
      throw new Error(`"${qText}" måste ha 2–3 svarsalternativ.`);
    }
    if (correctIndex === -1) {
      throw new Error(
        `Ingen rätt markering i frågan "${qText}". Rätt svar måste skrivas som "- *Rätt svar".`
      );
    }

    questions.push({ text: qText, options: opts, correctIndex });
  }

  return { title, questions };
}

// ===== RENDER =====
function renderQuiz(quiz) {
  quizContainer.innerHTML = "";
  quizTitle.textContent = quiz.title;
  appTitle.textContent = quiz.title;

  quiz.questions.forEach((q, qi) => {
    const div = document.createElement("div");
    div.className = "question";
    div.innerHTML = `
      <p class="q-title">${qi + 1}. ${escapeHtml(q.text)}
        <span class="badge" id="badge-${qi}"></span>
      </p>
      <div class="options">
        ${q.options.map((opt, oi) => `
          <label class="option">
            <input type="radio" name="q_${qi}" value="${oi}">
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join("")}
      </div>
    `;
    quizContainer.appendChild(div);
  });

  quizCard.classList.remove("hidden");
  quizCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== GRADE + OVERLAY =====
function gradeQuiz(quiz) {
  let score = 0;
  const wrongQIs = [];

  quiz.questions.forEach((q, qi) => {
    const sel = document.querySelector(`input[name="q_${qi}"]:checked`);
    const badge = el(`badge-${qi}`);

    if (!sel) {
      badge.textContent = "Ej svar";
      badge.className = "badge";
      wrongQIs.push(qi);
      return;
    }

    if (+sel.value === q.correctIndex) {
      score++;
      badge.textContent = "Rätt";
      badge.className = "badge ok";
    } else {
      badge.textContent = "Fel";
      badge.className = "badge err";
      wrongQIs.push(qi);
    }
  });

  lastGrade = { wrongQIs };

  overlayResult.innerHTML = `<strong>${score} / ${quiz.questions.length}</strong>`;
  overlayWrongBtn.disabled = wrongQIs.length === 0;
  overlayWrongBtn.style.opacity = wrongQIs.length === 0 ? "0.5" : "1";

  resultOverlay.classList.remove("hidden");
}

// ===== SHARE LINK =====
function encodeQuiz(text) {
  return btoa(unescape(encodeURIComponent(text)));
}
function decodeQuiz(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

// ===== EVENTS =====
copyPromptBtn.onclick = async () => {
  const prompt = buildPrompt(+qCountEl.value, +optCountEl.value);
  promptBox.value = prompt;
  const ok = await copyTextSmart(prompt, promptBox);
  copyStatus.textContent = ok
    ? "Prompt kopierad!"
    : "Markera och kopiera manuellt.";
};

loadBtn.onclick = () => {
  hideError();
  try {
    currentQuiz = parseQuiz(inputText.value);
    viewQuiz = currentQuiz;
    lastGrade = null;
    renderQuiz(viewQuiz);
  } catch (e) {
    showError(e.message);
  }
};

submitBtn.onclick = () => {
  if (viewQuiz) gradeQuiz(viewQuiz);
};

overlayCloseBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
};

overlayRedoBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  viewQuiz = currentQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
};

overlayWrongBtn.onclick = () => {
  if (!lastGrade?.wrongQIs?.length) return;

  viewQuiz = {
    title: `${currentQuiz.title} – Träna på fel`,
    questions: lastGrade.wrongQIs.map(i => currentQuiz.questions[i])
  };
  resultOverlay.classList.add("hidden");
  renderQuiz(viewQuiz);
};

overlayNewBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  inputText.value = "";
  resetUI();
};

shareLinkBtn.onclick = async () => {
  if (!inputText.value.trim()) return alert("Ingen provtext att dela.");
  const url =
    `${location.origin}${location.pathname}?quiz=${encodeQuiz(inputText.value)}`;
  const ok = await copyTextSmart(url, null);
  alert(ok ? "Delningslänk kopierad!" : url);
};

exampleBtn.onclick = () => {
  inputText.value = `TEST: Exempelprov

Q: Vad täcker ungefär 70 procent av jordens yta?
- Land
- Is
- *Hav

Q: 2 + 2?
- 3
- *4
- 5`;
};

clearBtn.onclick = () => {
  inputText.value = "";
  resetUI();
};

// ===== AUTOLOAD FROM LINK =====
(() => {
  const q = new URLSearchParams(location.search).get("quiz");
  if (!q) return;
  try {
    const decoded = decodeQuiz(q);
    inputText.value = decoded;
    currentQuiz = parseQuiz(decoded);
    viewQuiz = currentQuiz;
    renderQuiz(viewQuiz);
  } catch {
    showError("Kunde inte läsa provet från länken.");
  }
})();

resetUI();
