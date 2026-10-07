import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const badge = document.getElementById("statusBadge");
const chatLog = document.getElementById("chatLog");
const messageInput = document.getElementById("messageInput");
const systemPromptInput = document.getElementById("systemPrompt");
const tempInput = document.getElementById("tempInput");
const topKInput = document.getElementById("topKInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const newChatBtn = document.getElementById("newChatBtn");

// Small Qwen3 build so the weight download/caching stays practical for in-browser use.
const MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";

let engine = null;
let history = [];
let isBusy = false;

function setStatus(text, level) {
  badge.textContent = text;
  badge.className = "badge" + (level ? " " + level : "");
}

function appendMessage(role, text) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
  return node;
}

function clearMessages() {
  chatLog.innerHTML = "";
}

function setControlsEnabled(enabled) {
  sendBtn.disabled = !enabled || isBusy;
  newChatBtn.disabled = !enabled || isBusy;
}

function resetHistory() {
  const systemPrompt = systemPromptInput.value.trim();
  history = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
}

function getGenerationOptions() {
  const temp = Number(tempInput.value);
  const topK = Number(topKInput.value);
  const options = {};
  if (Number.isFinite(temp)) options.temperature = temp;
  if (Number.isFinite(topK)) options.top_k = topK;
  return options;
}

async function initEngine() {
  if (!navigator.gpu) {
    setStatus("WebGPU not available", "err");
    appendMessage(
      "assistant",
      "This browser does not support WebGPU, which is required to run Qwen locally.\n\n" +
        "Try a recent version of Chrome, Edge, or Firefox Nightly."
    );
    setControlsEnabled(false);
    return;
  }

  try {
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        setStatus(progress.text || "Loading model…", "warn");
      },
    });

    resetHistory();
    setStatus("Ready for chat", "");
    setControlsEnabled(true);
    appendMessage("assistant", "Qwen is loaded and running fully offline in your browser. Send your first message.");
  } catch (err) {
    console.error("Engine init error:", err);
    setStatus("Model load failed", "err");

    const message = err?.message || String(err);
    if (message.includes("maxStorageBuffersPerShaderStage")) {
      appendMessage(
        "assistant",
        "Your browser's WebGPU implementation doesn't yet support enough storage buffers per shader for this model.\n\n" +
          "This is a known current limitation in Firefox's WebGPU backend (vs. Chrome/Edge). Try Chrome, Edge, or Firefox Nightly with dom.webgpu.enabled."
      );
    } else {
      appendMessage("assistant", "Error loading the model: " + message);
    }
    setControlsEnabled(false);
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isBusy || !engine) return;

  isBusy = true;
  setControlsEnabled(true);
  appendMessage("user", text);
  messageInput.value = "";

  history.push({ role: "user", content: text });
  const assistantNode = appendMessage("assistant", "");

  try {
    const stream = await engine.chat.completions.create({
      messages: history,
      stream: true,
      ...getGenerationOptions(),
    });

    let reply = "";
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      reply += delta;
      assistantNode.textContent = reply;
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    history.push({ role: "assistant", content: reply });
  } catch (err) {
    console.error("Chat error:", err);
    assistantNode.textContent = "Error: " + (err?.message || String(err));
  } finally {
    isBusy = false;
    setControlsEnabled(true);
    messageInput.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

clearBtn.addEventListener("click", () => {
  clearMessages();
  appendMessage("assistant", "Messages cleared. Your current chat session context is still active.");
});

newChatBtn.addEventListener("click", async () => {
  if (isBusy || !engine) return;

  isBusy = true;
  setControlsEnabled(true);
  try {
    await engine.resetChat();
    resetHistory();
    clearMessages();
    appendMessage("assistant", "Started a fresh chat session with your current settings.");
  } catch (err) {
    console.error("New session error:", err);
    appendMessage("assistant", "Could not start a new session: " + (err?.message || String(err)));
  } finally {
    isBusy = false;
    setControlsEnabled(true);
  }
});

initEngine();
