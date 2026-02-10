// Mitt prov – frontend-only (Parse -> Render -> Grade -> Overlay -> Share link + AI prompt)
// Regel: Rätt svar måste skrivas som "- *Svar" (stjärnan direkt efter "- ")

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
let currentQuiz = null; // originalprov
let viewQuiz = null;    // det som visas just nu
let lastGrade = null;   // senaste rättningen (för träna på fel)

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
... (fortsätt)

- Skapa exakt ${numQuestions} frågor.
- Varje fråga ska ha exakt ${numOptions} svarsalternativ.
- Exakt ett alternativ per fråga ska markeras som rätt med en stjärna direkt efter "- ".
- Inga extra rubriker, ingen förklaring, ingen markdown.

BÖRJA NU.`;
}

// Smart kopiering (fungerar även när Clipboard API strular)
async function copyTextSmart(text, textareaToSelect) {
  // 1) Moderna Clipboard API
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  // 2) Fallback: markera i textarea + execCommand("copy")
  try {
    if (textareaToSelect) {
      textareaToSelect.value = text;
      textareaToSelect.focus();
      textareaToSelect.select();
      textareaToSelect.setSelectionRange(0, textareaToSelect.value.length);
    }
    const ok = document.execCommand("copy");
    return !!ok;
  } catch {}

  return false;
}

// ===== PARSER (tolerant men strikt på rätt-markering) =====
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
      const rawLine = lines[i].trim();

      // ✅ Endast "- *Svar" (eller "• *Svar", "– *Svar", "— *Svar") räknas som rätt
      const isCorrect = /^(-|•|–|—)\s*\*/.test(rawLine);

      // Ta bort ev. numrering först (t.ex. "1) - *Svar")
      let line = rawLine.replace(/^\d+[\.\)]\s+/, "");

      // Ta bort bullet-tecken (- • – —)
      line = line.replace(/^(-|•|–|—)\s*/, "");

      // Om korrekt: ta bort stjärnan direkt efter bullet
      if (isCorrect) line = line.replace(/^\*\s*/, "");

      line = line.trim();

      if (!line) throw new Error(`Tomt svar i frågan "${qText}"`);

      if (isCorrect) {
        if (correctIndex !== -1) {
          throw new Error(`Flera rätta svar i frågan "${qText}". Endast en rad får vara "- *Svar".`);
        }
        correctIndex = opts.length;
      }

      opts.push(line);
      i++;
    }

    if (opts.length < 2 || opts.length > 3) {
      throw new Error(`"${qText}" måste ha 2–3 svarsalternativ (har ${opts.length}).`);
    }
    if (correctIndex === -1) {
      throw new Error(`Ingen rätt markering i frågan "${qText}". Rätt svar måste skrivas som "- *Svar".`);
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

// ===== SHARE LINK (no backend) =====
function encodeQuiz(text) {
  return btoa(unescape(encodeURIComponent(text)));
}
function decodeQuiz(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

// ===== EVENTS =====

// Prompt: generera + visa + kopiera
copyPromptBtn.onclick = async () => {
  const prompt = buildPrompt(+qCountEl.value, +optCountEl.value);

  promptBox.value = prompt;
  promptBox.focus();
  promptBox.select();
  promptBox.setSelectionRange(0, promptBox.value.length);

  const ok = await copyTextSmart(prompt, promptBox);

  if (ok) {
    copyStatus.textContent = "Kopierad! Öppna AI-tjänsten och klistra in.";
    selectPromptBtn.classList.add("hidden");
  } else {
    copyStatus.textContent = "Kunde inte kopiera automatiskt. Markera och kopiera manuellt.";
    selectPromptBtn.classList.remove("hidden");
  }
};

selectPromptBtn.onclick = () => {
  promptBox.focus();
  promptBox.select();
  promptBox.setSelectionRange(0, promptBox.value.length);
  copyStatus.textContent = "Markerad. Kopiera manuellt.";
};

// Ladda prov
loadBtn.onclick = () => {
  hideError();
  try {
    currentQuiz = parseQuiz(inputText.value);
    viewQuiz = currentQuiz;
    lastGrade = null;
    renderQuiz(viewQuiz);
  } catch (e) {
    showError(e.message || String(e));
  }
};

// Klar
submitBtn.onclick = () => {
  if (!viewQuiz) return;
  gradeQuiz(viewQuiz);
};

// Overlay: stäng
overlayCloseBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
};

// Overlay: gör om (original)
overlayRedoBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  viewQuiz = currentQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
};

// Overlay: träna på fel
overlayWrongBtn.onclick = () => {
  if (!lastGrade?.wrongQIs?.length) return;

  const wrongQuiz = {
    title: `${currentQuiz.title} – Träna på fel`,
    questions: lastGrade.wrongQIs.map(i => currentQuiz.questions[i])
  };

  resultOverlay.classList.add("hidden");
  viewQuiz = wrongQuiz;
  lastGrade = null;
  renderQuiz(viewQuiz);
};

// Overlay: nytt
overlayNewBtn.onclick = () => {
  resultOverlay.classList.add("hidden");
  inputText.value = "";
  resetUI();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Delningslänk
shareLinkBtn.onclick = async () => {
  const text = inputText.value.trim();
  if (!text) {
    alert("Ingen provtext att dela.");
    return;
  }

  const encoded = encodeQuiz(text);
  const url = `${location.origin}${location.pathname}?quiz=${encoded}`;

  const ok = await copyTextSmart(url, null);
  alert(ok ? "Delningslänk kopierad! Skicka till mottagaren." : "Kunde inte kopiera länken:\n\n" + url);
};

// Exempel (uppdaterat: endast "- *" räknas)
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

// Rensa
clearBtn.onclick = () => {
  inputText.value = "";
  resetUI();
};

// ===== AUTOLOAD FROM LINK =====
(function () {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("quiz");
  if (!q) return;

  try {
    const decoded = decodeQuiz(q);
    inputText.value = decoded;

    currentQuiz = parseQuiz(decoded);
    viewQuiz = currentQuiz;
    lastGrade = null;
    renderQuiz(viewQuiz);

  } catch {
    showError("Kunde inte läsa provet från länken.");
  }
})();

// Init
resetUI();
