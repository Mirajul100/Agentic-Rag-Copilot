const form = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question-input");
const sendButton = document.querySelector("#send-button");
const welcome = document.querySelector("#welcome");
const messages = document.querySelector("#messages");
const serviceState = document.querySelector("#service-state");
const serviceLabel = document.querySelector("#service-label");
const uploadDialog = document.querySelector("#upload-dialog");
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#document-file");
const uploadResult = document.querySelector("#upload-result");
const toast = document.querySelector("#toast");

const icons = {
  assistant:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12v9H9l-4 3v-3H4zM7 8h6M7 10.5h4"/></svg>',
  source:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M4 6l4-4 4 4M4 10l4 4 4-4"/></svg>',
  link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5 9.5 6.5M6 6H4a3 3 0 0 0 0 6h2m4-6h2a3 3 0 1 1 0 6h-2"/></svg>',
};

function setService(state, label) {
  serviceState.dataset.state = state;
  serviceLabel.textContent = label;
}

async function checkService() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error();
    setService("online", "Service ready");
  } catch {
    setService("offline", "Service unavailable");
  }
}

function scrollToLatest() {
  window.requestAnimationFrame(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
  );
}

function addUserMessage(text) {
  const article = document.createElement("article");
  article.className = "message message-user";
  const bubble = document.createElement("div");
  bubble.className = "user-bubble";
  bubble.textContent = text;
  article.append(bubble);
  messages.append(article);
  return article;
}

function createAssistantMessage() {
  const article = document.createElement("article");
  article.className = "message message-assistant";
  const mark = document.createElement("div");
  mark.className = "message-mark";
  mark.innerHTML = icons.assistant;
  const body = document.createElement("div");
  body.className = "message-body";
  const role = document.createElement("div");
  role.className = "message-role";
  role.append(document.createTextNode("Daffodil Copilot"));
  const time = document.createElement("time");
  time.className = "message-time";
  time.dateTime = new Date().toISOString();
  time.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  role.append(time);
  const copy = document.createElement("div");
  copy.className = "message-copy";
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.setAttribute("aria-label", "Preparing an answer");
  typing.innerHTML = "<i></i><i></i><i></i>";
  copy.append(typing);
  body.append(role, copy);
  article.append(mark, body);
  messages.append(article);
  return { article, body, copy };
}

function renderAnswer(container, value) {
  container.replaceChildren();
  const lines = value.split(/\r?\n/);
  let list = null;
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement("p");
    p.textContent = paragraph.join(" ");
    container.append(p);
    paragraph = [];
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (!line.trim()) {
      flushParagraph();
      list = null;
      continue;
    }
    if (bullet) {
      flushParagraph();
      if (!list) {
        list = document.createElement("ul");
        container.append(list);
      }
      const item = document.createElement("li");
      item.textContent = bullet[1];
      list.append(item);
      continue;
    }
    if (/^\s*#{1,3}\s/.test(line)) {
      flushParagraph();
      list = null;
      const heading = document.createElement("p");
      heading.className = "answer-heading";
      heading.textContent = line.replace(/^\s*#{1,3}\s*/, "");
      container.append(heading);
      continue;
    }
    list = null;
    paragraph.push(line.trim());
  }
  flushParagraph();
}

function addTrace(body, steps) {
  if (!steps.length) return;
  const details = document.createElement("details");
  details.className = "trace";
  const summary = document.createElement("summary");
  summary.textContent = `Evidence trail · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const list = document.createElement("ol");
  list.className = "trace-list";
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    list.append(item);
  });
  details.append(summary, list);
  body.append(details);
}

function addSource(body, source) {
  if (!source) return;
  const labels = {
    private_kb: "Private university knowledge",
    web_search: "External web search",
    web: "External web search",
    direct: "Direct response",
    insufficient_evidence: "Evidence not sufficient",
  };
  const pill = document.createElement("span");
  pill.className = "answer-source";
  pill.dataset.source = source;
  pill.innerHTML = icons.source;
  pill.append(
    document.createTextNode(labels[source] || source.replaceAll("_", " ")),
  );
  body.append(pill);
}

function addCitations(body, citations) {
  if (!citations?.length) return;
  const group = document.createElement("div");
  group.className = "citations";
  citations.forEach((citation) => {
    const title = citation.title || citation.url || "Source";
    const isWeb =
      citation.type === "web" && /^https?:\/\//i.test(citation.url || "");
    const link = document.createElement(isWeb ? "a" : "span");
    link.className = "citation";
    if (isWeb) {
      link.href = citation.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.innerHTML = icons.link;
    const text = document.createElement("span");
    text.textContent = title.split(/[\\/]/).pop();
    link.append(text);
    group.append(link);
  });
  body.append(group);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(
    () => toast.classList.remove("visible"),
    3200,
  );
}

function handleEvent(event, state) {
  if (event.type === "token") {
    state.answer += event.content || "";
    state.copy.textContent = state.answer;
  } else if (event.type === "trace" && event.step) {
    state.trace.push(event.step);
  } else if (event.type === "metadata") {
    state.source = event.source_used || state.source;
    state.citations = event.citations || state.citations;
  } else if (event.type === "error") {
    state.error =
      event.detail || "The assistant could not complete this request";
  }
}

async function readEventStream(response, state) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      try {
        handleEvent(JSON.parse(data), state);
      } catch {
        /* Ignore malformed stream frames */
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .find((line) => line.startsWith("data:"))
      ?.slice(5)
      .trim();
    if (data) {
      try {
        handleEvent(JSON.parse(data), state);
      } catch {
        /* Ignore malformed final frame */
      }
    }
  }
}

async function askQuestion(question) {
  welcome.hidden = true;
  addUserMessage(question);
  const assistant = createAssistantMessage();
  const state = { answer: "", source: "", citations: [], trace: [], error: "" };
  sendButton.disabled = true;
  questionInput.disabled = true;
  scrollToLatest();
  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || `Request failed (${response.status})`);
    }
    await readEventStream(response, state);
    if (state.error) throw new Error(state.error);
    if (!state.answer)
      throw new Error("No answer was returned. Please try again.");
    renderAnswer(assistant.copy, state.answer);
    addSource(assistant.body, state.source);
    addCitations(assistant.body, state.citations);
    addTrace(assistant.body, state.trace);
    if (state.source === "insufficient_evidence")
      showToast("The available sources did not support a confident answer");
  } catch (error) {
    assistant.copy.classList.add("error-copy");
    assistant.copy.textContent =
      error.message ||
      "Something went wrong while contacting the support service";
    showToast("The question could not be answered");
  } finally {
    sendButton.disabled = false;
    questionInput.disabled = false;
    questionInput.focus();
    scrollToLatest();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (question.length < 2 || sendButton.disabled) return;
  questionInput.value = "";
  questionInput.style.height = "auto";
  askQuestion(question);
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 160)}px`;
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.prompt;
    form.requestSubmit();
  });
});

document.querySelector("#new-question").addEventListener("click", () => {
  messages.replaceChildren();
  welcome.hidden = false;
  questionInput.value = "";
  questionInput.focus();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    questionInput.focus();
  }
});

document.querySelector("#open-upload").addEventListener("click", () => {
  uploadResult.textContent = "";
  uploadResult.removeAttribute("data-state");
  uploadDialog.showModal();
});

document
  .querySelector("#close-upload")
  .addEventListener("click", () => uploadDialog.close());
document
  .querySelector("#cancel-upload")
  .addEventListener("click", () => uploadDialog.close());
fileInput.addEventListener("change", () => {
  document.querySelector("#file-label").textContent =
    fileInput.files[0]?.name || "Choose a file to upload";
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  const key = document.querySelector("#admin-key").value;
  if (!file || !key) return;
  const button = document.querySelector("#upload-button");
  const formData = new FormData();
  formData.append("file", file);
  button.disabled = true;
  button.textContent = "Indexing…";
  uploadResult.textContent = "Reading and indexing document";
  uploadResult.removeAttribute("data-state");
  try {
    const response = await fetch("/api/ingest", {
      method: "POST",
      headers: { admin_key: key },
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.detail || `Upload failed (${response.status})`);
    uploadResult.dataset.state = "success";
    uploadResult.textContent = `${result.filename} indexed · ${result.chunks_added} ${result.chunks_added === 1 ? "chunk" : "chunks"} added`;
    uploadForm.reset();
    document.querySelector("#file-label").textContent =
      "Choose a file to upload";
    showToast("Document added to university knowledge");
  } catch (error) {
    uploadResult.dataset.state = "error";
    uploadResult.textContent =
      error.message || "The document could not be indexed";
  } finally {
    button.disabled = false;
    button.textContent = "Index document";
  }
});

uploadDialog.addEventListener("click", (event) => {
  if (event.target === uploadDialog) uploadDialog.close();
});

checkService();
