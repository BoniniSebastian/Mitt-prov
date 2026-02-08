// Prov-MVP: allt sker lokalt i webbläsaren (ingen backend)

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

// AI-prompt UI
const qCountEl = el("qCount");
const optCountEl = el("optCount");
const copyPromptBtn = el("copyPromptBtn");
const copyStatus = el("copyStatus");

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

Q: Hur många ben har en spindel?
- *8
- 6
- 10
`;

// ===== HJÄLP =====
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

// ===== PARSE =====
function parseQuiz(raw) {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error("Ingen text att parsa.");

  let title = "Prov";
  let i = 0;

  if (lines[i].toUpperCase().startsWith("TEST:")) {
    title = lines[i].slice(5).trim() || "Prov";
    i++;
  }

  const questions = [];
  while (i < lines.length) {
    if (!lines[i].toUpperCase().startsWith("Q:")) {
      throw new Error(`Förväntade "Q:" men fick "${lines[i]}"`);
    }

    const qText = lines[i].slice(2).trim();
    i++;

    const options = [];
    let correctIndex = -1;

    while (i < lines.length && lines[i].startsWith("-")) {
      let opt = lines[i].replace(/^-+\s*/, "");
      let isCorrect = false;

      if (opt.startsWith("*")) {
        isCorrect = true;
        opt = opt.slice(1).trim();
      }

      if (isCorrect) {
        if (correctIndex !== -1) {
          throw new Error(`Flera rätta svar i frågan: "${qText}"`);
        }
        correctIndex = options.length;
      }

      options.push(opt);
      i++;
    }

    if (options.length < 2 || options.length > 3) {
      throw new Error(`Frågan "${qText}" måste ha 2–3 svar.`);
    }
    if (correctIndex === -1) {
      throw new Error(`Ingen rätt markering (*) i frågan: "${qText}"`);
    }

    questions.push({ text: qText, options, correctIndex });
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
      <p class="q-title">${qi+1}. ${escapeHtml(q.text)} <span class="badge" id="badge-${qi}"></span></p>
      <div class="options">
        ${q.options.map((o, oi) => `
          <label class="option">
            <input type="radio" name="q_${qi}" value="${oi}">
            <span>${escapeHtml(o)}</span>
          </label>
        `).join("")}
      </div>
    `;
    quizContainer.appendChild(div);
  });

  quizCard.classList.remove("hidden");
}

// ===== RÄTTA =====
function gradeQuiz(quiz) {
  let score = 0;
  const wrong = [];

  quiz.questions.forEach((q, qi) => {
    const sel = document.querySelector(`input[name="q_${qi}"]:checked`);
    const badge = el(`badge-${qi}`);

    if (!sel) {
      badge.textContent = "Ej svar";
      wrong.push(qi);
      return;
    }

    if (+sel.value === q.correctIndex) {
      score++;
      badge.textContent = "Rätt";
      badge.className = "badge ok";
    } else {
      badge.textContent = "Fel";
      badge.className = "badge err";
      wrong.push(qi);
    }
  });

  lastGrade = { wrong };

  resultEl.classList.remove("hidden");
  resultEl.innerHTML = `<strong>Resultat:</strong> ${score} / ${quiz.questions.length}`;
  afterActions.classList.remove("hidden");
}

// ===== AI PROMPT =====
function buildPrompt(qCount, optCount) {
  return `Du är en provgenerator.

Skapa exakt ${qCount} frågor baserat på bifogade bilder.

FORMAT (inget annat):
TEST: Titel

Q: Fråga
- Svar A
- *Rätt svar
${optCount === 3 ? "- Svar C\n" : ""}

Regler:
- Exakt ${optCount} svar per fråga
- Endast ett rätt svar (*)
- Inga förklaringar.`;
}

// ===== KOPIERA (iOS-SÄKER) =====
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

copyPromptBtn.addEventListener("click", async () => {
  const prompt = buildPrompt(+qCountEl.value, +optCountEl.value);
  const ok = await copyToClipboard(prompt);

  if (ok) {
    copyStatus.textContent = "Kopierad! Öppna ChatGPT och klistra in.";
  } else {
    copyStatus.textContent = "Kunde inte kopiera – markera manuellt.";
    window.prompt("Kopiera prompten:", prompt);
  }
});

// ===== EVENTS =====
loadBtn.addEventListener("click", () => {
  try {
    hideError();
    currentQuiz = parseQuiz(inputText.value);
    viewQuiz = currentQuiz;
    renderQuiz(viewQuiz);
  } catch (e) {
    showError(e.message);
  }
});

submitBtn.addEventListener("click", () => gradeQuiz(viewQuiz));
redoBtn.addEventListener("click", () => renderQuiz(currentQuiz));
wrongOnlyBtn.addEventListener("click", () => {
  viewQuiz = {
    title: currentQuiz.title + " – träna på fel",
    questions: lastGrade.wrong.map(i => currentQuiz.questions[i])
  };
  renderQuiz(viewQuiz);
});
newQuizBtn.addEventListener("click", () => {
  inputText.value = "";
  resetUI();
});

clearBtn.addEventListener("click", () => inputText.value = "");
exampleBtn.addEventListener("click", () => inputText.value = EXAMPLE_TEXT);

// INIT
resetUI();
