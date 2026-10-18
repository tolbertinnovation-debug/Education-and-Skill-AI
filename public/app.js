// Front end for Education & Skills AI. No build step: plain ES modules.
// All AI calls go through the server, which holds the OpenAI key.

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the app still works for this visit.
    }
  },
};

const state = {
  config: null,
  module: null,
  view: 'chat',
  busy: false,
  pendingImage: null,
  lastToolOutput: '',
};

function renderMarkdown(text) {
  const html = window.marked ? window.marked.parse(text) : escapeHtml(text);
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : escapeHtml(text);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- API ----------

async function api(path, body, { stream = false, onText } = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-code': store.get('accessCode', '') },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && state.config.requiresAccessCode) {
    await askAccessCode();
    return api(path, body, { stream, onText });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  if (!stream) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}

function askAccessCode() {
  return new Promise((resolve) => {
    const dialog = $('#accessDialog');
    dialog.addEventListener(
      'close',
      () => {
        store.set('accessCode', $('#accessInput').value.trim());
        resolve();
      },
      { once: true },
    );
    dialog.showModal();
  });
}

// Re-render at most once per animation frame while text streams in.
function throttledRender(el) {
  let pending = null;
  return (text) => {
    if (pending === null) {
      requestAnimationFrame(() => {
        el.innerHTML = renderMarkdown(pending);
        pending = null;
      });
    }
    pending = text;
  };
}

// ---------- Forms built from field definitions ----------

function fieldElement(field, value) {
  const label = document.createElement('label');
  label.textContent = field.label + (field.required ? ' *' : '');
  if (field.type === 'textarea') label.classList.add('wide');

  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    for (const opt of field.options) input.add(new Option(opt.label, opt.value));
  } else if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 5;
    input.maxLength = 15000;
  } else {
    input = document.createElement('input');
    input.type = field.type === 'number' ? 'number' : 'text';
    if (field.type === 'number') input.min = 0;
    else input.maxLength = 300;
  }
  input.name = field.id;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.required) input.required = true;
  input.value = value ?? field.default ?? '';
  label.append(input);
  return label;
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------- Module selection ----------

function contextKey() {
  return `ctx:${state.module.id}`;
}
function chatKey() {
  return `chat:${state.module.id}`;
}
function getContext() {
  return readForm($('#contextForm'));
}

function selectModule(id) {
  const mod = state.config.modules.find((m) => m.id === id) ?? state.config.modules[0];
  state.module = mod;
  store.set('module', mod.id);
  location.hash = mod.id;

  for (const btn of $('#moduleNav').children) btn.classList.toggle('active', btn.dataset.id === mod.id);
  $('#moduleTitle').textContent = `${mod.icon} ${mod.name}`;
  $('#moduleTagline').textContent = mod.tagline;

  const saved = store.get(contextKey(), {});
  const form = $('#contextForm');
  form.replaceChildren(...mod.contextFields.map((f) => fieldElement(f, saved[f.id])));

  const cta = $('#orgCta');
  if (mod.id === 'abroad') {
    const { orgName, orgContactUrl } = state.config;
    cta.replaceChildren(`Need hands-on help with your application or visa? Talk to a ${orgName} advisor. `);
    if (orgContactUrl) {
      const a = document.createElement('a');
      a.href = orgContactUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Contact ${orgName} →`;
      cta.append(a);
    }
    cta.hidden = false;
  } else {
    cta.hidden = true;
  }

  $('#quizTab').hidden = !mod.supportsQuiz;
  $('#attachLabel').hidden = !mod.supportsImages;
  clearImage();
  renderChat();
  renderToolList();
  $('#quizArea').replaceChildren();
  showView(state.view === 'quiz' && !mod.supportsQuiz ? 'chat' : state.view);
}

function showView(view) {
  state.view = view;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.view === view);
  for (const v of ['chat', 'tools', 'quiz']) $(`#view-${v}`).hidden = v !== view;
}

// ---------- Chat ----------

function messageElement(m) {
  const div = document.createElement('div');
  div.className = `msg ${m.role}`;
  if (m.role === 'user') {
    if (m.image) {
      const img = document.createElement('img');
      img.src = m.image;
      img.alt = 'Attached image';
      div.append(img);
    }
    div.append(m.content);
  } else {
    div.classList.add('markdown');
    div.innerHTML = renderMarkdown(m.content);
  }
  return div;
}

function renderChat() {
  const messages = store.get(chatKey(), []);
  $('#messages').replaceChildren(...messages.map(messageElement));
  const starters = $('#starters');
  starters.replaceChildren();
  if (messages.length === 0) {
    for (const s of state.module.starters) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.onclick = () => {
        $('#chatInput').value = s;
        $('#chatInput').focus();
      };
      starters.append(b);
    }
  }
}

async function sendChat(text) {
  if (state.busy) return;
  const messages = store.get(chatKey(), []);
  const userMsg = { role: 'user', content: text };
  if (state.pendingImage) userMsg.image = state.pendingImage;
  messages.push(userMsg);
  store.set(contextKey(), getContext());

  $('#starters').replaceChildren();
  $('#messages').append(messageElement(userMsg));
  const bubble = messageElement({ role: 'assistant', content: '' });
  bubble.classList.add('typing');
  $('#messages').append(bubble);
  bubble.scrollIntoView({ block: 'end' });
  clearImage();
  setBusy(true);

  try {
    const render = throttledRender(bubble);
    const reply = await api(
      '/api/chat',
      { module: state.module.id, context: getContext(), messages },
      { stream: true, onText: render },
    );
    messages.push({ role: 'assistant', content: reply });
    saveChat(messages);
  } catch (err) {
    bubble.classList.add('error');
    bubble.textContent = err.message;
    messages.pop(); // let the user retry without a dangling question
    saveChat(messages);
  } finally {
    bubble.classList.remove('typing');
    setBusy(false);
  }
}

// Images are large; keep only the most recent one in saved history.
function saveChat(messages) {
  const lastImage = messages.findLastIndex((m) => m.image);
  store.set(
    chatKey(),
    messages.slice(-40).map((m, i) => (m.image && i !== lastImage ? { ...m, image: undefined } : m)),
  );
}

function setBusy(busy) {
  state.busy = busy;
  for (const el of document.querySelectorAll('#sendBtn, #toolForm button[type=submit], #quizForm button')) {
    el.disabled = busy;
  }
}

function clearImage() {
  state.pendingImage = null;
  $('#imagePreview').hidden = true;
  $('#imageInput').value = '';
}

// Shrink photos before upload so they are cheap on mobile data.
function resizeImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Tools ----------

function renderToolList() {
  $('#toolPanel').hidden = true;
  const list = $('#toolList');
  list.hidden = false;
  list.replaceChildren(
    ...state.module.tools.map((tool) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-card';
      const strong = document.createElement('strong');
      strong.textContent = tool.name;
      const span = document.createElement('span');
      span.className = 'muted small';
      span.textContent = tool.description;
      b.append(strong, span);
      b.onclick = () => openTool(tool);
      return b;
    }),
  );
}

function openTool(tool) {
  state.tool = tool;
  $('#toolList').hidden = true;
  $('#toolPanel').hidden = false;
  $('#toolName').textContent = tool.name;
  $('#toolDesc').textContent = tool.description;
  const saved = store.get(`tool:${state.module.id}:${tool.id}`, {});
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = 'Generate';
  $('#toolForm').replaceChildren(...tool.fields.map((f) => fieldElement(f, saved[f.id])), submit);
  $('#toolOutputWrap').hidden = true;
  $('#toolOutput').replaceChildren();
}

async function runTool() {
  if (state.busy) return;
  const values = readForm($('#toolForm'));
  store.set(`tool:${state.module.id}:${state.tool.id}`, values);
  store.set(contextKey(), getContext());
  const out = $('#toolOutput');
  $('#toolOutputWrap').hidden = false;
  out.classList.remove('error');
  out.classList.add('typing');
  out.replaceChildren();
  out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  setBusy(true);
  try {
    state.lastToolOutput = await api(
      `/api/tools/${state.module.id}/${state.tool.id}`,
      { context: getContext(), values },
      { stream: true, onText: throttledRender(out) },
    );
  } catch (err) {
    out.textContent = err.message;
    state.lastToolOutput = '';
  } finally {
    out.classList.remove('typing');
    setBusy(false);
  }
}

// ---------- Quiz ----------

async function runQuiz() {
  if (state.busy) return;
  const { topic, count } = readForm($('#quizForm'));
  store.set(contextKey(), getContext());
  const area = $('#quizArea');
  area.innerHTML = '<p class="muted typing">Writing your questions</p>';
  setBusy(true);
  try {
    const quiz = await api('/api/quiz', { context: getContext(), topic, count: Number(count) });
    renderQuiz(quiz);
  } catch (err) {
    area.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

function renderQuiz(quiz) {
  const area = $('#quizArea');
  const form = document.createElement('form');
  const h = document.createElement('h2');
  h.textContent = quiz.title;
  form.append(h);

  quiz.questions.forEach((q, qi) => {
    const box = document.createElement('div');
    box.className = 'quiz-q';
    const p = document.createElement('div');
    p.className = 'markdown';
    p.innerHTML = renderMarkdown(`**${qi + 1}.** ${q.question}`);
    const fs = document.createElement('fieldset');
    q.options.forEach((opt, oi) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `q${qi}`;
      input.value = oi;
      label.append(input, `${'ABCDEFG'[oi]}. ${opt}`);
      fs.append(label);
    });
    box.append(p, fs);
    form.append(box);
  });

  const submit = document.createElement('button');
  submit.className = 'primary';
  submit.textContent = 'Mark my quiz';
  form.append(submit);

  form.onsubmit = (e) => {
    e.preventDefault();
    let score = 0;
    const missed = new Set();
    quiz.questions.forEach((q, qi) => {
      const box = form.querySelectorAll('.quiz-q')[qi];
      const chosen = form.querySelector(`input[name=q${qi}]:checked`);
      const labels = box.querySelectorAll('label');
      labels.forEach((l, oi) => {
        l.querySelector('input').disabled = true;
        if (oi === q.answerIndex) l.classList.add('correct');
        else if (chosen && Number(chosen.value) === oi) l.classList.add('wrong');
      });
      if (chosen && Number(chosen.value) === q.answerIndex) score++;
      else missed.add(q.topic);
      const ex = document.createElement('div');
      ex.className = 'explain markdown';
      ex.innerHTML = renderMarkdown(`**Explanation:** ${q.explanation}`);
      box.append(ex);
    });
    submit.remove();
    const result = document.createElement('div');
    result.className = 'output';
    const pct = Math.round((score / quiz.questions.length) * 100);
    result.innerHTML = `<p class="score">Score: ${score} / ${quiz.questions.length} (${pct}%)</p>`;
    if (missed.size) {
      const p = document.createElement('p');
      p.textContent = `Topics to revise: ${[...missed].join(', ')}.`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Ask the tutor to explain these';
      b.onclick = () => {
        showView('chat');
        sendChat(`I just took a practice quiz and got these topics wrong: ${[...missed].join(', ')}. Please help me understand them, starting with the first.`);
      };
      result.append(p, b);
    }
    form.prepend(result);
    result.scrollIntoView({ behavior: 'smooth' });
  };

  area.replaceChildren(form);
}

// ---------- Wiring ----------

function wire() {
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text && !state.pendingImage) return;
    input.value = '';
    input.style.height = '';
    sendChat(text);
  };
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });
  $('#chatInput').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  });
  $('#clearChat').onclick = () => {
    if (confirm('Clear this conversation?')) {
      store.set(chatKey(), []);
      renderChat();
    }
  };
  $('#imageInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.pendingImage = await resizeImage(file);
      $('#imagePreview img').src = state.pendingImage;
      $('#imagePreview').hidden = false;
    } catch (err) {
      alert(err.message);
    }
  };
  $('#removeImage').onclick = clearImage;

  $('#contextForm').onchange = () => store.set(contextKey(), getContext());
  $('#contextForm').onsubmit = (e) => e.preventDefault();

  for (const tab of document.querySelectorAll('.tab')) tab.onclick = () => showView(tab.dataset.view);
  $('#backToTools').onclick = renderToolList;
  $('#toolForm').onsubmit = (e) => {
    e.preventDefault();
    runTool();
  };
  $('#quizForm').onsubmit = (e) => {
    e.preventDefault();
    runQuiz();
  };

  $('#copyOutput').onclick = async () => {
    try {
      await navigator.clipboard.writeText(state.lastToolOutput);
      $('#copyOutput').textContent = 'Copied ✓';
      setTimeout(() => ($('#copyOutput').textContent = 'Copy'), 1500);
    } catch {
      alert('Copy failed. Select the text and copy it manually.');
    }
  };
  $('#downloadOutput').onclick = () => {
    const blob = new Blob([state.lastToolOutput], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.module.id}-${state.tool.id}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#printOutput').onclick = () => window.print();
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== state.module?.id) selectModule(id);
  });
}

async function init() {
  const res = await fetch('/api/config');
  state.config = await res.json();
  const nav = $('#moduleNav');
  for (const m of state.config.modules) {
    const b = document.createElement('button');
    b.dataset.id = m.id;
    b.textContent = `${m.icon} ${m.name}`;
    b.onclick = () => selectModule(m.id);
    nav.append(b);
  }
  wire();
  // On phones, keep the settings folded so the conversation gets the screen.
  if (matchMedia('(max-width: 600px)').matches) $('#contextPanel').open = false;
  if (state.config.requiresAccessCode && !store.get('accessCode', '')) await askAccessCode();
  selectModule(location.hash.slice(1) || store.get('module', 'tutor'));
}

init().catch((err) => {
  document.body.textContent = `Could not start the app: ${err.message}`;
});
