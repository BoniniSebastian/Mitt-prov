// Prov-MVP: Parse -> Render -> Grade -> Redo/Wrong-only (no backend)

const el = (id) => document.getElementById(id);

// ===== DOM =====
const inputText = el("inputText");
const loadBtn = el("loadBtn");
const clearBtn = el("clearBtn");
const exampleBtn = el("exampleBtn");

const quizCard = el("quizCard");
const quizTitle = el("quizTitle");
const quizContainer = el("quizContainer");

const submitBtn = el("submitBtn");
const parseError = el("parseError");
const resultEl = el("result");

const afterActions = el("afterActions");
const newQuizBtn = el("newQuizBtn");
const redoBtn = el("redoBtn");
const wrongOnlyBtn = el("wrongOnlyBtn");

const appTitle = el("appTitle");

// AI Prompt UI
const qCountEl = el("qCount");
const optCountEl = el("optCount");
const copyPromptBtn = el("copyPromptBtn");
const copyStatus = el("copyStatus");

// NYTT: prompt-ruta + markera-knapp
const promptBox = el("promptBox");
const selectPromptBtn = el("selectPromptBtn");

// ===== STATE =====
let currentQuiz = null; // full quiz
let viewQuiz = null;    // currently rendered quiz (full or wrong-only)
let lastGrade = null;   // { wrongQIs: number[] }

const EXAMPLE_TEXT = `TEST: Exempelprov

Q: Vilken färg har himlen en klar dag?
- Grön
- *Blå
- Röd

Q: Hur många ben har en spindel?
- *8
- 6
- 10

Q: Vilket är ett däggdjur?
- Haj
- *Hund
- Örn
`;

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
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}
function resetUI() {
  currentQuiz = null;
  viewQuiz = null;
  lastGrade = null;

  quizCard.classList.add("hidden");
  quizContainer.innerHTML = "";
  resultEl.classList.add("hidden");
  resultEl.innerHTML = "";
  afterActions.classList.add("hidden");

  hideError();
  appTitle.textContent = "Prov";
}

// ===== PARSE FORMAT =====
function parseQuiz(raw) {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) throw new Error("Ingen text att parsa.");

  let title = "Prov";
  let i = 0;

  if (lines[i].toUpperCase().startsWith("TEST:")) {
    title = lines[i].slice(5).trim() || "Prov";
    i++;
  }

  const questions = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.toUpperCase().startsWith("Q:")) {
      throw new Error(`Förväntade "Q:" men fick: "${line}"`);
    }

    const qText = line.slice(2).trim();
    if (!qText) throw new Error("En fråga saknar text efter Q:.");
    i++;

    const opts = [];
    let correctIndex = -1;

    while (i < lines.length && lines[i].startsWith("-")) {
      let opt = lines[i].replace(/^-+\s*/, "");
      let isCorrect = false;

      if (opt.startsWith("*")) {
        isCorrect = true;
        opt = opt.slice(1).trim();
      }

      if (!opt) throw new Error(`Ett svarsalternativ är tomt i frågan: "${qText}"`);

      if (isCorrect) {
        if (correctIndex !== -1) {
          throw new Error(`Flera rätta svar markerade i frågan: "${qText}". Endast ett får ha *.`);
        }
        correctIndex = opts.length;
      }

      opts.push(opt);
      i++;
    }

    if (opts.length < 2 || opts.length > 3) {
      throw new Error(`Frågan "${qText}" måste ha 2–3 svarsalternativ (har ${opts.length}).`);
    }
    if (correctIndex === -1) {
      throw new Error(`Ingen rätt markering (*) i frågan: "${qText}".`);
    }

    questions.push({ text: qText, options: opts, correctIndex });
  }

  if (questions.length === 0) throw new Error("Inga frågor hittades.");
  return { title, questions };
}

// ===== RENDER QUIZ =====
function renderQuiz(quiz) {
  quizContainer.innerHTML = "";
  resultEl.classList.add("hidden");
  resultEl.innerHTML = "";
  afterActions.classList.add("hidden");

  quizTitle.textContent = quiz.title;
  appTitle.textContent = quiz.title;

  quiz.questions.forEach((q, qi) => {
    const qDiv = document.createElement("div");
    qDiv.className = "question";

    qDiv.innerHTML = `
      <p class="q-title">${qi + 1}. ${escapeHtml(q.text)} <span class="badge" id="badge-${qi}"></span></p>
      <div class="options" role="radiogroup" aria-label="Fråga ${qi + 1}">
        ${q.options.map((opt, oi) => {
          const name = `q_${qi}`;
          const id = `q_${qi}_o_${oi}`;
          return `
            <label class="option" for="${id}">
              <input type="radio" id="${id}" name="${name}" value="${oi}" />
              <span>${escapeHtml(opt)}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;

    quizContainer.appendChild(qDiv);
  });

  quizCard.classList.remove("hidden");
  quizCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== GRADE =====
function gradeQuiz(quiz) {
  let score = 0;
  const wrongQIs = [];

  quiz.questions.forEach((q, qi) => {
    const selected = document.querySelector(`input[name="q_${qi}"]:checked`);
    const badge = el(`badge-${qi}`);

    if (!selected) {
      badge.textContent = "Ej svar";
      badge.className = "badge";
      wrongQIs.push(qi);
      return;
    }

    const chosen = Number(selected.value);
    const ok = chosen === q.correctIndex;

    if (ok) {
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

  resultEl.classList.remove("hidden");
  resultEl.innerHTML = `
    <strong>Resultat:</strong> ${score} / ${quiz.questions.length}<br/>
    <span class="muted">Grönt = rätt, rött = fel, “Ej svar” = obesvarad fråga.</span>
  `;

  afterActions.classList.remove("hidden");

  // Disable "Träna på fel" om inga fel
  if (wrongQIs.length === 0) {
    wrongOnlyBtn.disabled = true;
    wrongOnlyBtn.title = "Inga fel att träna på";
    wrongOnlyBtn.style.opacity = "0.6";
    wrongOnlyBtn.style.cursor = "not-allowed";
  } else {
    wrongOnlyBtn.disabled = false;
    wrongOnlyBtn.title = "";
    wrongOnlyBtn.style.opacity = "1";
    wrongOnlyBtn.style.cursor = "pointer";
  }

  resultEl.scrollIntoView({ behavior: "smooth", block: "end" });
}

function buildWrongOnlyQuiz(fullQuiz, wrongQIs) {
  const questions = wrongQIs.map(qi => fullQuiz.questions[qi]);
  return {
    title: `${fullQuiz.title} – Träna på fel`,
    questions
  };
}

// ===== AI PROMPT =====
function buildPrompt(numQuestions, numOptions) {
  const third = numOptions === 3 ? "- <svar C>\n" : "";
  return `Du är en provgenerator.

Jag kommer bifoga 1–10 bilder/foton (t.ex. sidor ur en bok/arbetsblad). Skapa ett prov baserat ENDAST på innehållet i bilderna.

KRAV:
- Svara ENDAST i detta textformat (inget annat):
TEST: <kort titel>

Q: <fråga 1>
- <svar A>
- *<rätt svar>
${third}
Q: <fråga 2>
- <svar A>
- *<rätt svar>
${third}
... (fortsätt)

- Skapa exakt ${numQuestions} frågor.
- Varje fråga ska ha exakt ${numOptions} svarsalternativ.
- Exakt ett alternativ per fråga ska markeras som rätt med en stjärna direkt efter "- ".
- Inga extra rubriker, ingen förklaring, ingen markdown.
- Svaren ska vara korta och tydligt olika.

BÖRJA NU.`;
}

// ===== COPY (iOS-safe): ALWAYS show prompt + auto-select =====
copyPromptBtn.addEventListener("click", async () => {
  const numQuestions = Number(qCountEl.value);
  const numOptions = Number(optCountEl.value);
  const prompt = buildPrompt(numQuestions, numOptions);

  // 1) Visa prompten (så den alltid går att kopiera manuellt)
  promptBox.value = prompt;

  // 2) Markera allt direkt (iOS)
  promptBox.focus();
  promptBox.select();
  promptBox.setSelectionRange(0, promptBox.value.length);

  // 3) Försök kopiera automatiskt (kan funka på vissa iOS)
  let ok = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(prompt);
      ok = true;
    }
  } catch {}

  if (!ok) {
    try {
      ok = document.execCommand("copy");
    } catch {}
  }

  copyStatus.textContent = ok
    ? "Kopierad! Öppna ChatGPT och klistra in + bifoga bilder."
    : "Prompten är markerad. Tryck och håll i rutan → Kopiera.";
});

selectPromptBtn.addEventListener("click", () => {
  promptBox.focus();
  promptBox.select();
  promptBox.setSelectionRange(0, promptBox.value.length);
  copyStatus.textContent = "Markerad. Tryck och håll i rutan → Kopiera.";
});

// ===== UI EVENTS =====
loadBtn.addEventListener("click", () => {
  hideError();
  try {
    const quiz = parseQuiz(inputText.value);
    currentQuiz = quiz;
    viewQuiz = quiz;
    lastGrade = null;
    renderQuiz(viewQuiz);
  } catch (e) {
    showError(e.message || String(e));
  }
});

submitBtn.addEventListener("click", () => {
  if (!viewQuiz) return;
  gradeQuiz(viewQuiz);
});

redoBtn.addEventListener("click", () => {
  if (!currentQuiz) return;
  viewQuiz = currentQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
});

wrongOnlyBtn.addEventListener("click", () => {
  if (!currentQuiz || !lastGrade) return;
  if (lastGrade.wrongQIs.length === 0) return;

  viewQuiz = buildWrongOnlyQuiz(currentQuiz, lastGrade.wrongQIs);
  lastGrade = null;
  renderQuiz(viewQuiz);
});

newQuizBtn.addEventListener("click", () => {
  inputText.value = "";
  resetUI();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

clearBtn.addEventListener("click", () => {
  inputText.value = "";
  resetUI();
});

exampleBtn.addEventListener("click", () => {
  inputText.value = EXAMPLE_TEXT;
});

// Init
resetUI();
