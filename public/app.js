let currentUser = null;
let currentTeam = 'product';
let dashboardData = { teams: [], messages: [], tasks: [], leaderboard: [], users: [] };

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initModals();
  checkSession();
});

async function api(path, options = {}) {
  options.headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function checkSession() {
  api('/api/auth/me')
    .then(data => {
      currentUser = data.user;
      currentTeam = currentUser.team;
      showApp();
    })
    .catch(() => {
      showAuth();
    });
}

function initAuth() {
  const tabSignin = document.getElementById('tab-signin');
  const tabSignup = document.getElementById('tab-signup');
  const formSignin = document.getElementById('form-signin');
  const formSignup = document.getElementById('form-signup');
  const errorDiv = document.getElementById('auth-error');

  tabSignin?.addEventListener('click', () => {
    tabSignin.classList.add('active');
    tabSignup.classList.remove('active');
    formSignin.hidden = false;
    formSignup.hidden = true;
    errorDiv.textContent = '';
  });

  tabSignup?.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabSignin.classList.remove('active');
    formSignup.hidden = false;
    formSignin.hidden = true;
    errorDiv.textContent = '';
  });

  formSignin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    try {
      const data = await api('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('signin-email').value,
          password: document.getElementById('signin-password').value
        })
      });
      currentUser = data.user;
      currentTeam = currentUser.team;
      showApp();
    } catch (err) {
      errorDiv.textContent = err.message;
    }
  });

  formSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    try {
      const data = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('signup-name').value,
          email: document.getElementById('signup-email').value,
          password: document.getElementById('signup-password').value,
          team: document.getElementById('signup-team').value,
          role: document.getElementById('signup-role').value
        })
      });
      currentUser = data.user;
      currentTeam = currentUser.team;
      showApp();
    } catch (err) {
      errorDiv.textContent = err.message;
    }
  });

  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await api('/api/auth/signout', { method: 'POST' });
    currentUser = null;
    showAuth();
  });
}

function showAuth() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app-screen').hidden = true;
}

function showApp() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app-screen').hidden = false;

  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('user-display-team').textContent = `${currentUser.team.toUpperCase()} (${currentUser.role})`;
  document.getElementById('user-role-badge').textContent = currentUser.role === 'leader' ? 'Project Manager' : 'Teammate';

  if (currentUser.role === 'leader') {
    document.getElementById('btn-new-task').hidden = false;
    document.getElementById('invite-section').hidden = false;
  } else {
    document.getElementById('btn-new-task').hidden = true;
    document.getElementById('invite-section').hidden = true;
  }

  loadDashboard();
}

async function loadDashboard() {
  try {
    dashboardData = await api('/api/dashboard');
    renderTeams();
    renderChat();
    renderTasks();
    renderLeaderboard();
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderTeams() {
  const teamList = document.getElementById('team-list');
  if (!teamList) return;
  
  teamList.innerHTML = '';
  dashboardData.teams.forEach(team => {
    const li = document.createElement('li');
    const isUserTeam = currentUser.team === team.id;
    const isLeader = currentUser.role === 'leader';
    const canAccess = isLeader || isUserTeam;

    li.className = `nav-item ${currentTeam === team.id ? 'active' : ''} ${!canAccess ? 'disabled' : ''}`;
    li.innerHTML = `
      <span class="team-icon">${team.icon}</span>
      <span class="team-name">${team.name}</span>
      ${!canAccess ? '<span class="lock-icon">🔒</span>' : ''}
    `;

    li.addEventListener('click', () => {
      if (!canAccess) {
        alert('Access Restricted: Teammates can only access their assigned team space.');
        return;
      }
      currentTeam = team.id;
      renderTeams();
      renderChat();
      renderTasks();
    });

    teamList.appendChild(li);
  });

  const spaceTitle = document.getElementById('current-space-title');
  const activeTeamObj = dashboardData.teams.find(t => t.id === currentTeam);
  if (spaceTitle && activeTeamObj) {
    spaceTitle.textContent = activeTeamObj.name;
  }
}

function renderChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  container.innerHTML = '';
  const filteredMessages = dashboardData.messages.filter(m => m.team === currentTeam);

  if (filteredMessages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet in this team space.</div>';
    return;
  }

  filteredMessages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `
      <div class="msg-header">
        <strong class="msg-author">${m.author}</strong>
        <span class="msg-time">${m.at}</span>
      </div>
      <div class="msg-body">${m.text}</div>
    `;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ team: currentTeam, text })
    });
    dashboardData.messages.push(res.message);
    input.value = '';
    renderChat();
  } catch (err) {
    alert(err.message);
  }
});

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if (!container) return;

  container.innerHTML = '';
  const isLeader = currentUser.role === 'leader';
  const teamTasks = dashboardData.tasks.filter(t => t.team === currentTeam);

  if (teamTasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks created for this team.</div>';
    return;
  }

  teamTasks.forEach(task => {
    const div = document.createElement('div');
    div.className = `task-card ${task.status === 'Done' ? 'completed' : ''}`;
    
    let actionsHtml = '';
    if (task.status !== 'Done') {
      actionsHtml += `<button class="secondary-btn small-btn" onclick="completeTask(${task.id})">Complete (+150 pts)</button>`;
    }
    if (isLeader) {
      actionsHtml += `<button class="danger-btn small-btn" onclick="deleteTask(${task.id})">Delete</button>`;
    }

    div.innerHTML = `
      <div class="task-info">
        <h4>${task.title}</h4>
        <p>Assignee: <strong>${task.assignee}</strong> | Due: ${task.due} | Status: <span class="status-badge">${task.status}</span></p>
      </div>
      <div class="task-actions">${actionsHtml}</div>
    `;
    container.appendChild(div);
  });
}

async function completeTask(taskId) {
  try {
    const res = await api('/api/tasks/submit', {
      method: 'POST',
      body: JSON.stringify({ taskId })
    });
    alert(`Task completed! Points earned: +${res.pointsEarned}`);
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    await api('/api/tasks/delete', {
      method: 'POST',
      body: JSON.stringify({ taskId })
    });
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  container.innerHTML = '';
  const list = dashboardData.leaderboard || [];

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No users on the leaderboard yet.</div>';
    return;
  }

  list.forEach((u, index) => {
    const div = document.createElement('div');
    div.className = 'leaderboard-row';
    div.innerHTML = `
      <span class="rank">#${index + 1}</span>
      <span class="name">${u.name} (${u.team.toUpperCase()})</span>
      <span class="points">${u.points || 0} pts</span>
    `;
    container.appendChild(div);
  });
}

function initNavigation() {
  document.getElementById('btn-new-task')?.addEventListener('click', () => {
    document.getElementById('task-modal').hidden = false;
  });

  document.getElementById('btn-close-task')?.addEventListener('click', () => {
    document.getElementById('task-modal').hidden = true;
  });

  document.getElementById('btn-open-invite')?.addEventListener('click', () => {
    document.getElementById('invite-modal').hidden = false;
    document.getElementById('invite-result').hidden = true;
  });

  document.getElementById('btn-close-invite')?.addEventListener('click', () => {
    document.getElementById('invite-modal').hidden = true;
  });
}

function initModals() {
  document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('task-title').value,
          team: document.getElementById('task-team').value,
          assignee: document.getElementById('task-assignee').value,
          due: document.getElementById('task-due').value
        })
      });
      document.getElementById('task-modal').hidden = true;
      document.getElementById('task-form').reset();
      await loadDashboard();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('invite-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultDiv = document.getElementById('invite-result');
    try {
      const res = await api('/api/teams/invite', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('invite-name').value,
          email: document.getElementById('invite-email').value,
          team: document.getElementById('invite-team').value,
          role: document.getElementById('invite-role').value
        })
      });

      resultDiv.hidden = false;
      resultDiv.innerHTML = `Member Invited Successfully!<br>Email: <strong>${res.user.email}</strong><br>Temporary Password: <strong>${res.tempPass}</strong>`;
      document.getElementById('invite-form').reset();
      await loadDashboard();
    } catch (err) {
      resultDiv.hidden = false;
      resultDiv.textContent = err.message;
    }
  });
}
