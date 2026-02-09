// Prov-MVP: Parse -> Render -> Grade -> Overlay -> Redo/Wrong-only (no backend)

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

const appTitle = el("appTitle");

// Efter-åtgärder (behålls för logik)
const newQuizBtn = el("newQuizBtn");
const redoBtn = el("redoBtn");
const wrongOnlyBtn = el("wrongOnlyBtn");

// ===== Overlay DOM =====
const resultOverlay = el("resultOverlay");
const overlayResult = el("overlayResult");
const overlayRedoBtn = el("overlayRedoBtn");
const overlayWrongBtn = el("overlayWrongBtn");
const overlayNewBtn = el("overlayNewBtn");
const overlayCloseBtn = el("overlayCloseBtn");

// ===== AI Prompt UI =====
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

// ===== EXEMPEL =====
const EXAMPLE_TEXT = `TEST: Exempelprov

Q: Vilken färg har himlen en klar dag?
- Grön
- *Blå
- Röd

Hur många ben har en spindel?
*8
6
10
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
  hideError();
  appTitle.textContent = "Mitt prov";
}

// ===== TOLERANT PARSER =====
function parseQuiz(raw) {
  const lines = raw
    .replace(/\r\n/g, "\n")
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
      let line = lines[i]
        .replace(/^(-|•|–|—)\s+/, "")
        .replace(/^\d+[\.\)]\s+/, "")
        .trim();

      let isCorrect = false;
      if (line.startsWith("*")) {
        isCorrect = true;
        line = line.slice(1).trim();
      }

      if (!line) throw new Error(`Tomt svar i frågan "${qText}"`);

      if (isCorrect) {
        if (correctIndex !== -1) {
          throw new Error(`Flera rätta svar i frågan "${qText}"`);
        }
        correctIndex = opts.length;
      }

      opts.push(line);
      i++;
    }

    if (opts.length < 2 || opts.length > 3) {
      throw new Error(`"${qText}" måste ha 2–3 svar (har ${opts.length})`);
    }
    if (correctIndex === -1) {
      throw new Error(`Ingen rätt markering (*) i "${qText}"`);
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
      wrongQIs.push(qi);
      return;
    }

    if (Number(sel.value) === q.correctIndex) {
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

  overlayResult.innerHTML = `
    <strong>${score} / ${quiz.questions.length}</strong>
  `;

  overlayWrongBtn.disabled = wrongQIs.length === 0;
  resultOverlay.classList.remove("hidden");
}

// ===== WRONG ONLY =====
function buildWrongOnlyQuiz(full, wrongQIs) {
  return {
    title: `${full.title} – Träna på fel`,
    questions: wrongQIs.map(i => full.questions[i])
  };
}

// ===== PROMPT =====
function buildPrompt(q, o) {
  const third = o === 3 ? "- <svar C>\n" : "";
  return `Du är en provgenerator.

Jag bifogar bilder. Skapa ett prov ENDAST från innehållet.

FORMAT:
TEST: <titel>

Q: <fråga>
- <svar A>
- *<rätt svar>
${third}

- Skapa exakt ${q} frågor
- Exakt ${o} svar per fråga
- Exakt ett * per fråga
- Inget annat än texten ovan
`;
}

// ===== EVENTS =====
copyPromptBtn.onclick = async () => {
  const p = buildPrompt(+qCountEl.value, +optCountEl.value);
  promptBox.value = p;
  promptBox.select();

  try {
    await navigator.clipboard.writeText(p);
    copyStatus.textContent = "Kopierad!";
    selectPromptBtn.classList.add("hidden");
  } catch {
    copyStatus.textContent = "Markera och kopiera manuellt";
    selectPromptBtn.classList.remove("hidden");
  }
};

selectPromptBtn.onclick = () => {
  promptBox.select();
};

loadBtn.onclick = () => {
  hideError();
  try {
    currentQuiz = parseQuiz(inputText.value);
    viewQuiz = currentQuiz;
    renderQuiz(viewQuiz);
  } catch (e) {
    showError(e.message);
  }
};

submitBtn.onclick = () => gradeQuiz(viewQuiz);

overlayCloseBtn.onclick = () => resultOverlay.classList.add("hidden");
overlayRedoBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  renderQuiz(currentQuiz);
};
overlayWrongBtn.onclick = () => {
  if (!lastGrade?.wrongQIs.length) return;
  resultOverlay.classList.add("hidden");
  renderQuiz(buildWrongOnlyQuiz(currentQuiz, lastGrade.wrongQIs));
};
overlayNewBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  inputText.value = "";
  resetUI();
};

clearBtn.onclick = () => {
  inputText.value = "";
  resetUI();
};

exampleBtn.onclick = () => {
  inputText.value = EXAMPLE_TEXT;
};

// Init
resetUI();
