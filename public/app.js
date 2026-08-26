let state = { user: null, data: null, view: 'chat', signup: false, space: 'general' };

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

function initials(n) { return n ? n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() : '??'; }
function teamName(id) { return state.data?.teams?.find(t => t.id === id)?.name || id; }

function toggleAuth() {
  state.signup = !state.signup;
  $('#name').hidden = !state.signup;
  $('#team').hidden = !state.signup;
  $('#role').hidden = !state.signup;
  $('#title').hidden = !state.signup;
  
  $('#authTitle').textContent = state.signup ? 'Create your workspace account' : 'Welcome back';
  $('#authSub').textContent = state.signup ? 'Select your role (Leader or Teammate) to get started.' : 'Sign in to your workspace.';
  $('#authBtn').innerHTML = (state.signup ? 'Create account' : 'Sign in') + ' <b>→</b>';
  $('#switchText').innerHTML = state.signup ? 'Already have an account? <button onclick="toggleAuth()">Sign in</button>' : 'New to Nexus? <button onclick="toggleAuth()">Create an account</button>';
  $('#authError').textContent = '';
}

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const payload = {
      name: $('#name').value,
      email: $('#email').value,
      password: $('#password').value,
      team: $('#team').value,
      role: $('#role').value,
      title: $('#title').value
    };
    const r = await api('/api/auth/' + (state.signup ? 'signup' : 'signin'), { method: 'POST', body: JSON.stringify(payload) });
    await boot(r.user);
  } catch (err) {
    $('#authError').textContent = err.message;
  }
});

async function boot(user) {
  state.user = user;
  state.data = await api('/api/dashboard');
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#profileName').textContent = user.name;
  $('#profileRoleBadge').textContent = `${user.role === 'leader' ? '⭐ Leader' : 'Teammate'} • ${user.title || ''}`;
  $('#profileAvatar').textContent = initials(user.name);
  render();
}

async function signout() {
  await api('/api/auth/signout', { method: 'POST' });
  location.reload();
}

function setView(v) {
  state.view = v;
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  render();
}

document.querySelectorAll('.nav').forEach(x => x.onclick = () => setView(x.dataset.view));

function render() {
  const settings = {
    chat: ['SPACES & CHAT', 'Team Communication Spaces', 'chatView'],
    tasks: ['TASKS & SUBMISSIONS', 'Work & Reward Pipeline', 'tasksView'],
    leaderboard: ['LEADERBOARD', 'Top Contributors & Rankings', 'leaderboardView'],
    team: ['MY TEAM', 'Focused Delivery', 'teamView'],
    changes: ['VERSION CONTROL', 'Repository Activity', 'changesView']
  }[state.view];

  $('#kicker').textContent = settings[0];
  $('#pageTitle').textContent = settings[1];
  $('#view').replaceChildren($('#' + settings[2]).content.cloneNode(true));

  if (state.view === 'chat') renderChat();
  if (state.view === 'tasks') renderTasks();
  if (state.view === 'leaderboard') renderLeaderboard();
  if (state.view === 'team') renderTeam();
  if (state.view === 'changes') renderChanges();
}

function switchSpace(space, element) {
  state.space = space;
  document.querySelectorAll('.rooms .room').forEach(r => r.classList.remove('selected'));
  if (element) element.classList.add('selected');
  
  const spaceTitles = {
    'general': '# General Talk',
    'task-1': '# Task 1 Space',
    'task-2': '# Task 2 Space',
    'fun': '# Fun & Resting Space'
  };
  
  if ($('#currentSpaceTitle')) $('#currentSpaceTitle').textContent = spaceTitles[space] || space;
  renderChatMessages();
}

function renderChat() {
  if ($('#inviteBtn')) $('#inviteBtn').hidden = state.user.role !== 'leader';
  $('#teams').innerHTML = state.data.teams.map(t => `<div class="team-chip"><span class="avatar" style="display:inline-grid;width:20px;height:20px;font-size:8px;margin-right:7px">${t.icon}</span>${esc(t.name)}</div>`).join('');
  
  renderChatMessages();

  $('#messageForm').onsubmit = async e => {
    e.preventDefault();
    const input = $('#messageInput');
    try {
      const r = await api('/api/messages', { method: 'POST', body: JSON.stringify({ text: input.value, space: state.space, global: true }) });
      state.data.messages.push(r.message);
      input.value = '';
      renderChatMessages();
    } catch (err) {
      alert(err.message);
    }
  };
}

function renderChatMessages() {
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;
  
  const spaceMsgs = state.data.messages.filter(m => (m.space || 'general') === state.space);
  messagesContainer.innerHTML = spaceMsgs.map(m => `
    <article class="message">
      <div class="avatar">${initials(m.author)}</div>
      <div>
        <span class="message-name">${esc(m.author)}</span>
        <span class="message-time">${m.at} · ${esc(teamName(m.team))}</span>
        <p class="message-text">${esc(m.text)}</p>
        ${m.team !== state.user.team ? `<button class="explain" onclick="explain(${m.id})">✦ Explain this with AI</button><div class="explanation" id="explain-${m.id}" hidden></div>` : ''}
      </div>
    </article>
  `).join('');
}

function handleInvite() {
  if (state.user.role !== 'leader') return alert('Only leaders can invite new members.');
  const email = prompt('Enter teammate email to send invite link:');
  if (email) alert(`Invite successfully sent to ${email}!`);
}

async function submitTask(taskId) {
  try {
    const res = await api('/api/tasks/submit', { method: 'POST', body: JSON.stringify({ taskId }) });
    alert(`🎉 Task Completed! You earned +${res.pointsEarned} points! Total Points: ${res.totalPoints}`);
    state.data = await api('/api/dashboard');
    render();
  } catch (err) {
    alert(err.message);
  }
}

function taskCard(t) {
  const isDone = t.status === 'Done';
  return `
    <article class="task-card">
      <div class="task-team">${esc(teamName(t.team).toUpperCase())}</div>
      <h3>${esc(t.title)}</h3>
      <div class="task-foot">
        <span><span class="avatar" style="display:inline-grid;width:22px;height:22px;font-size:8px;vertical-align:middle;margin-right:6px">${t.assignee}</span>${esc(t.owner)}</span>
        <span>Due: ${esc(t.due)}</span>
      </div>
      <div style="margin-top:18px; display:flex; justify-content:space-between; align-items:center;">
        <span class="status">${esc(t.status)}</span>
        ${!isDone ? `<button class="primary" style="padding:6px 12px; font-size:11px;" onclick="submitTask(${t.id})">Pass / Finish Task ➔</button>` : `<span style="color:#2ecc71; font-weight:bold; font-size:12px;">✓ Passed (+Pts)</span>`}
      </div>
    </article>
  `;
}

function renderTasks() {
  if ($('#createTaskBtn')) $('#createTaskBtn').hidden = state.user.role !== 'leader';
  $('#allTasks').innerHTML = state.data.tasks.map(taskCard).join('');
}

function renderLeaderboard() {
  const leaderboard = state.data.leaderboard || [];
  $('#leaderboardRows').innerHTML = leaderboard.map((u, i) => `
    <tr style="${u.id === state.user.id ? 'background: #A8001525;' : ''}">
      <td><strong>#${i + 1}</strong></td>
      <td>
        <span class="owner">
          <span class="avatar">${initials(u.name)}</span>
          <strong>${esc(u.name)}</strong> ${u.id === state.user.id ? '(You)' : ''}
        </span>
      </td>
      <td>${esc(u.title || (u.role === 'leader' ? 'Project Manager' : 'Teammate'))}</td>
      <td>${esc(teamName(u.team))}</td>
      <td><strong style="color:var(--red); font-size:16px;">${u.points || 0} pts</strong></td>
    </tr>
  `).join('');
}

function renderTeam() {
  const tasks = state.data.tasks.filter(t => t.team === state.user.team);
  const done = tasks.filter(t => t.status === 'Done').length;
  $('#teamName').textContent = teamName(state.user.team);
  $('#teamSummary').innerHTML = `
    <div class="metric"><strong>${tasks.length}</strong><span>Open work items</span></div>
    <div class="metric"><strong>${done}</strong><span>Completed</span></div>
    <div class="metric"><strong>${tasks.filter(t => t.status === 'Review').length}</strong><span>In review</span></div>
  `;
  $('#teamTasks').innerHTML = tasks.map(t => `
    <tr>
      <td><strong>${esc(t.title)}</strong></td>
      <td><span class="owner"><span class="avatar">${t.assignee}</span>${esc(t.owner)}</span></td>
      <td>${esc(t.due)}</td>
      <td><span class="status">${esc(t.status)}</span></td>
    </tr>
  `).join('');
}

function renderChanges() {
  $('#changes').innerHTML = state.data.changes.map(c => `
    <article>
      <div>
        <p class="change-title">${esc(c.title)}</p>
        <span class="change-meta">${esc(c.author)} · ${esc(c.file)} · ${esc(c.time)}</span>
      </div>
      <div>
        <span class="hash">${c.hash}</span>
        <span class="status">${esc(c.kind)}</span>
      </div>
    </article>
  `).join('');
}

function openModal(type) {
  $('#modal').hidden = false;
  const task = type === 'task';
  $('#modalKicker').textContent = task ? 'NEW WORK ITEM' : 'MANUAL REPOSITORY LOG';
  $('#modalTitle').textContent = task ? 'Create a task' : 'Log a change';
  
  $('#modalForm').innerHTML = task ? `
    <input name="title" placeholder="What needs to be done?" required>
    <input name="due" type="date" required>
    <button class="primary">Create task</button>
  ` : `
    <input name="title" placeholder="Change title" required>
    <input name="file" placeholder="File path changed" required>
    <select name="kind"><option>Modified</option><option>Added</option><option>Removed</option></select>
    <button class="primary">Log change</button>
  `;

  $('#modalForm').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      const res = await api(task ? '/api/tasks' : '/api/changes', { method: 'POST', body: JSON.stringify(d) });
      state.data[task ? 'tasks' : 'changes'][task ? 'push' : 'unshift'](res[task ? 'task' : 'change']);
      closeModal();
      render();
    } catch (err) {
      alert(err.message);
    }
  };
}

function closeModal() { $('#modal').hidden = true; }

async function explain(id) {
  const m = state.data.messages.find(x => x.id === id);
  const box = $('#explain-' + id);
  if (!box) return;
  box.hidden = false;
  box.textContent = 'Thinking…';
  try {
    const res = await api('/api/explain', { method: 'POST', body: JSON.stringify({ text: m.text }) });
    box.innerHTML = '<b>AI EXPLANATION</b><br>' + esc(res.explanation);
  } catch (err) {
    box.textContent = err.message;
  }
}

(async () => {
  try {
    const r = await api('/api/auth/me');
    await boot(r.user);
  } catch {}
})();
