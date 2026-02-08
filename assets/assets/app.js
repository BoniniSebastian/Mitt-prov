// Prov-MVP: Parse -> Render -> Grade -> Redo/Wrong-only (no backend)

const el = (id) => document.getElementById(id);

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

let currentQuiz = null;       // full quiz
let viewQuiz = null;          // currently rendered quiz (full or wrong-only)
let lastGrade = null;         // { chosenIndices: (number|null)[], wrongQIs: number[] }

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
    qDiv.dataset.qi = String(qi);

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

function gradeQuiz(quiz) {
  const chosenIndices = [];
  const wrongQIs = [];

  let score = 0;
  const total = quiz.questions.length;

  quiz.questions.forEach((q, qi) => {
    const selected = document.querySelector(`input[name="q_${qi}"]:checked`);
    const badge = el(`badge-${qi}`);

    if (!selected) {
      chosenIndices.push(null);
      badge.textContent = "Ej svar";
      badge.className = "badge";
      wrongQIs.push(qi);
      return;
    }

    const chosen = Number(selected.value);
    chosenIndices.push(chosen);

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

  lastGrade = { chosenIndices, wrongQIs };

  resultEl.classList.remove("hidden");
  resultEl.innerHTML = `
    <strong>Resultat:</strong> ${score} / ${total}<br/>
    <span class="muted">Grönt = rätt, rött = fel, “Ej svar” = obesvarad fråga.</span>
  `;

  afterActions.classList.remove("hidden");

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

  resultEl.scrollIntoView({ behavior
