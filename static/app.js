const form = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question-input");
const sendButton = document.querySelector("#send-button");
const welcome = document.querySelector("#welcome");
const messages = document.querySelector("#messages");
const chatStatus = document.querySelector("#chat-status");
const serviceState = document.querySelector("#service-state");
const serviceLabel = document.querySelector("#service-label");
const themeSelect = document.querySelector("#theme-select");
const themeColor = document.querySelector('meta[name="theme-color"]');
const uploadDialog = document.querySelector("#upload-dialog");
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#document-file");
const uploadResult = document.querySelector("#upload-result");
const toast = document.querySelector("#toast");
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(mode, save = false) {
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme =
    mode === "system" ? (systemColorScheme.matches ? "dark" : "light") : mode;
  themeSelect.value = mode;
  if (save) {
    try {
      localStorage.setItem("daffodil-theme", mode);
    } catch {
      // Theme selection still applies for this page when storage is unavailable.
    }
  }
  themeColor.content = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
}

themeSelect.value = document.documentElement.dataset.themeMode || "system";
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value, true));
systemColorScheme.addEventListener("change", () => {
  if (themeSelect.value === "system") applyTheme("system");
});

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
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    }),
  );
}

function isNearLatest() {
  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 180
  );
}

function addUserMessage(text) {
  const article = document.createElement("article");
  article.className = "message message-user";
  article.setAttribute("aria-label", "Your question");
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
  article.setAttribute("aria-label", "Daffodil Copilot answer");
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
  const execution = document.createElement("details");
  execution.className = "execution";
  execution.open = true;
  const executionSummary = document.createElement("summary");
  executionSummary.textContent = "Working through your question";
  const executionList = document.createElement("ol");
  executionList.className = "execution-list";
  execution.append(executionSummary, executionList);
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.setAttribute("aria-label", "Preparing an answer");
  typing.innerHTML = "<i></i><i></i><i></i>";
  copy.append(typing);
  body.append(role, execution, copy);
  article.append(mark, body);
  messages.append(article);
  return { article, body, copy, execution, executionSummary, executionList };
}

function appendInlineMarkdown(container, text) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > lastIndex) {
      container.append(document.createTextNode(text.slice(lastIndex, index)));
    }

    const token = match[0];
    let element;
    let content;
    if (token.startsWith("**") || token.startsWith("__")) {
      element = document.createElement("strong");
      content = token.slice(2, -2);
    } else if (token.startsWith("`")) {
      element = document.createElement("code");
      content = token.slice(1, -1);
    } else {
      element = document.createElement("em");
      content = token.slice(1, -1);
    }
    element.textContent = content;
    container.append(element);
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    container.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderAnswer(container, value) {
  container.replaceChildren();
  const lines = value.split(/\r?\n/);
  let list = null;
  let listType = "";
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement("p");
    appendInlineMarkdown(p, paragraph.join(" "));
    container.append(p);
    paragraph = [];
  };

  const appendListItem = (type, text, start = null) => {
    flushParagraph();
    if (!list || listType !== type) {
      list = document.createElement(type);
      listType = type;
      if (type === "ol" && start !== null) list.start = start;
      container.append(list);
    }
    const item = document.createElement("li");
    appendInlineMarkdown(item, text);
    list.append(item);
  };

  for (const line of lines) {
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)/);
    const bullet = line.match(/^\s*(?:[-*+]\s+|•\s+)(.+)/);
    if (!line.trim()) {
      flushParagraph();
      list = null;
      listType = "";
      continue;
    }
    if (ordered) {
      appendListItem("ol", ordered[2], Number(ordered[1]));
      continue;
    }
    if (bullet) {
      appendListItem("ul", bullet[1]);
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)/);
    if (heading) {
      flushParagraph();
      list = null;
      listType = "";
      const level = heading[1].length;
      const headingElement = document.createElement(`h${level + 1}`);
      headingElement.className = "answer-heading";
      appendInlineMarkdown(headingElement, heading[2]);
      container.append(headingElement);
      continue;
    }
    list = null;
    listType = "";
    paragraph.push(line.trim());
  }
  flushParagraph();
}

function updateToolProgress(event, state, assistant) {
  let step = state.toolSteps.get(event.id);
  if (!step) {
    const item = document.createElement("li");
    item.className = "execution-step";
    const marker = document.createElement("span");
    marker.className = "execution-marker";
    marker.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "execution-label";
    const status = document.createElement("span");
    status.className = "execution-state";
    item.append(marker, label, status);
    assistant.executionList.append(item);
    step = { item, label, status };
    state.toolSteps.set(event.id, step);
  }

  step.label.textContent = event.label || "Working";
  step.item.dataset.state = event.status === "complete" ? "complete" : "running";
  step.status.textContent =
    event.status === "complete" ? event.detail || "Done" : "In progress";
  assistant.executionSummary.textContent =
    `Answer process · ${state.toolSteps.size} ${state.toolSteps.size === 1 ? "step" : "steps"}`;
  chatStatus.textContent =
    event.status === "complete"
      ? `${step.label} complete.`
      : `${step.label}. In progress.`;
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

function handleEvent(event, state, assistant) {
  if (event.type === "token") {
    const content = typeof event.content === "string" ? event.content : "";
    if (!content) return;
    state.answer += content;
    state.pendingText += content;
    if (!state.streamNode) {
      state.copy.replaceChildren();
      state.streamNode = document.createTextNode("");
      state.copy.append(state.streamNode);
      state.copy.classList.add("is-streaming");
    }
    if (!state.renderFrame) {
      state.renderFrame = window.requestAnimationFrame(() => {
        const shouldFollow = isNearLatest();
        state.streamNode.appendData(state.pendingText);
        state.pendingText = "";
        state.renderFrame = 0;
        if (shouldFollow) scrollToLatest();
      });
    }
  } else if (event.type === "trace" && event.step) {
    state.trace.push(event.step);
  } else if (event.type === "tool") {
    updateToolProgress(event, state, assistant);
  } else if (event.type === "metadata") {
    state.source = event.source_used || state.source;
    state.citations = event.citations || state.citations;
  } else if (event.type === "error") {
    state.error =
      event.detail || "The assistant could not complete this request";
  }
}

function flushStream(state) {
  if (state.renderFrame) {
    window.cancelAnimationFrame(state.renderFrame);
    state.renderFrame = 0;
  }
  if (state.pendingText && state.streamNode) {
    state.streamNode.appendData(state.pendingText);
    state.pendingText = "";
  }
}

function stopRunningSteps(state) {
  state.toolSteps.forEach((step) => {
    if (step.item.dataset.state === "running") {
      step.item.dataset.state = "stopped";
      step.status.textContent = "Stopped";
    }
  });
}

async function readEventStream(response, state, assistant) {
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
        handleEvent(JSON.parse(data), state, assistant);
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
        handleEvent(JSON.parse(data), state, assistant);
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
  const state = {
    answer: "",
    source: "",
    citations: [],
    trace: [],
    error: "",
    toolSteps: new Map(),
    pendingText: "",
    streamNode: null,
    renderFrame: 0,
  };
  chatStatus.textContent = "Finding an answer.";
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
    await readEventStream(response, state, assistant);
    flushStream(state);
    if (state.error) throw new Error(state.error);
    if (!state.answer)
      throw new Error("No answer was returned. Please try again.");
    renderAnswer(assistant.copy, state.answer);
    assistant.copy.classList.remove("is-streaming");
    addSource(assistant.body, state.source);
    addCitations(assistant.body, state.citations);
    assistant.executionSummary.textContent =
      `Answer process · ${state.toolSteps.size} ${state.toolSteps.size === 1 ? "step" : "steps"}`;
    chatStatus.textContent = "Answer ready. The latest response is in the conversation.";
    if (state.source === "insufficient_evidence")
      showToast("The available sources did not support a confident answer");
  } catch (error) {
    flushStream(state);
    stopRunningSteps(state);
    assistant.executionSummary.textContent = "Answer process stopped";
    assistant.copy.classList.remove("is-streaming");
    assistant.copy.replaceChildren();
    if (state.answer) renderAnswer(assistant.copy, state.answer);
    if (!state.answer) assistant.copy.textContent = "";
    assistant.copy.classList.add("error-copy");
    const errorMessage =
      error.message || "Something went wrong while contacting the support service";
    const errorCopy = document.createElement("p");
    errorCopy.textContent = errorMessage;
    assistant.copy.append(errorCopy);
    chatStatus.textContent = "The answer could not be completed. " + errorMessage;
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

function formatApiError(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(formatApiError).filter(Boolean).join("; ");
  }
  if (!detail || typeof detail !== "object") return "";

  const message = [
    detail.message,
    detail.msg,
    formatApiError(detail.detail),
    formatApiError(detail.error),
  ].find((value) => typeof value === "string" && value.length > 0);
  if (!message) return "";
  const location = Array.isArray(detail.loc)
    ? detail.loc.slice(1).filter((part) => typeof part === "string").join(" ")
    : "";
  return location ? `${location}: ${message}` : message;
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  const adminKey = document.querySelector("#admin-key");
  const key = adminKey.value;
  if (!key.trim()) {
    uploadResult.dataset.state = "error";
    uploadResult.textContent = "Enter the admin key to index a document.";
    adminKey.focus();
    return;
  }
  if (!file) {
    uploadResult.dataset.state = "error";
    uploadResult.textContent = "Choose a document to upload.";
    fileInput.focus();
    return;
  }
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
      headers: { "admin-key": key },
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        formatApiError(result.detail) || `Upload failed (${response.status})`,
      );
    }
    uploadResult.dataset.state = "success";
    const indexedFilename = result.filename || file.name;
    const chunksAdded = Number.isInteger(result.chunks_added)
      ? result.chunks_added
      : null;
    uploadResult.textContent =
      chunksAdded === null
        ? `${indexedFilename} indexed successfully.`
        : `${indexedFilename} indexed · ${chunksAdded} ${chunksAdded === 1 ? "chunk" : "chunks"} added`;
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
