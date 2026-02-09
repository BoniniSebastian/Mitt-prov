// Prov – Parse -> Render -> Grade -> Overlay -> Share link (no backend)

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

// ===== PARSER =====
function parseQuiz(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
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
        if (correctIndex !== -1) throw new Error(`Flera rätta svar i "${qText}"`);
        correctIndex = opts.length;
      }

      opts.push(line);
      i++;
    }

    if (opts.length < 2 || opts.length > 3) {
      throw new Error(`"${qText}" måste ha 2–3 svar`);
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

// ===== GRADE =====
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
  resultOverlay.classList.remove("hidden");
}

// ===== SHARE LINK =====
function encodeQuiz(text) {
  return btoa(unescape(encodeURIComponent(text)));
}
function decodeQuiz(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

shareLinkBtn.onclick = () => {
  const text = inputText.value.trim();
  if (!text) {
    alert("Ingen provtext att dela.");
    return;
  }

  const encoded = encodeQuiz(text);
  const url = `${location.origin}${location.pathname}?quiz=${encoded}`;

  navigator.clipboard.writeText(url).then(() => {
    alert("Delningslänk kopierad! Skicka till ditt barn.");
  });
};

// ===== EVENTS =====
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
  if (!viewQuiz) return;
  gradeQuiz(viewQuiz);
};

overlayRedoBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  viewQuiz = currentQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
};

overlayWrongBtn.onclick = () => {
  if (!lastGrade?.wrongQIs.length) return;
  const wrongQuiz = {
    title: `${currentQuiz.title} – Träna på fel`,
    questions: lastGrade.wrongQIs.map(i => currentQuiz.questions[i])
  };
  resultOverlay.classList.add("hidden");
  viewQuiz = wrongQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
};

overlayNewBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  inputText.value = "";
  resetUI();
};

overlayCloseBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
};

exampleBtn.onclick = () => {
  inputText.value = `TEST: Exempelprov

Q: 2 + 2?
- 3
- *4
- 5`;
};

clearBtn.onclick = () => {
  inputText.value = "";
  resetUI();
};
// ===== AI PROMPT =====
function buildPrompt(numQuestions, numOptions) {
  const third = numOptions === 3 ? "- <svar C>\n" : "";
  return `Du är en provgenerator.

Jag kommer bifoga 1–10 bilder/foton (t.ex. sidor ur en bok/arbetsblad).
Skapa ett prov baserat ENDAST på innehållet i bilderna.

KRAV – svara EXAKT i detta format:

TEST: <kort titel>

Q: <fråga 1>
- <svar A>
- *<rätt svar>
${third}

- Skapa exakt ${numQuestions} frågor
- Varje fråga ska ha exakt ${numOptions} svarsalternativ
- Exakt ett alternativ per fråga ska markeras med *
- Inga extra rubriker, ingen förklaring, ingen markdown

BÖRJA NU.`;
}

// ===== Prompt button =====
copyPromptBtn.onclick = async () => {
  const prompt = buildPrompt(+qCountEl.value, +optCountEl.value);

  // 🔴 DETTA VAR FELET – nu skrivs prompten in
  promptBox.value = prompt;
  promptBox.classList.remove("hidden");

  promptBox.focus();
  promptBox.select();
  promptBox.setSelectionRange(0, promptBox.value.length);

  try {
    await navigator.clipboard.writeText(prompt);
    copyStatus.textContent = "Kopierad! Öppna AI-tjänsten och klistra in.";
    selectPromptBtn.classList.add("hidden");
  } catch {
    copyStatus.textContent = "Kunde inte kopiera automatiskt. Markera och kopiera manuellt.";
    selectPromptBtn.classList.remove("hidden");
  }
};
  const prompt = buildPrompt(+qCountEl.value, +optCountEl.value);

  promptBox.value = prompt;
  promptBox.focus();
  promptBox.select();

  try {
    await navigator.clipboard.writeText(prompt);
    copyStatus.textContent = "Kopierad! Öppna AI-tjänsten och klistra in.";
    selectPromptBtn.classList.add("hidden");
  } catch {
    copyStatus.textContent = "Kunde inte kopiera automatiskt. Markera och kopiera manuellt.";
    selectPromptBtn.classList.remove("hidden");
  }
};

selectPromptBtn.onclick = () => {
  promptBox.focus();
  promptBox.select();
};

// ===== AUTOLOAD FROM LINK =====
(function () {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("quiz");
  if (q) {
    try {
      const decoded = decodeQuiz(q);
      inputText.value = decoded;
      currentQuiz = parseQuiz(decoded);
      viewQuiz = currentQuiz;
      renderQuiz(viewQuiz);
    } catch {
      showError("Kunde inte läsa provet från länken.");
    }
  }
})();

// Init
resetUI();
