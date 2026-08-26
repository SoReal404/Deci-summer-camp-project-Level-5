const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nativeFetch = global.fetch;

global.fetch = (url, options) => nativeFetch(String(url).replace('models/gemini-2.0-flash', 'models/gemini-3.6-flash'), options);

const PORT = process.env.PORT || 3000;
process.env.GEMINI_API_KEY ||= 'manual-key-configured';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const sessions = new Map();
const publicFiles = { 
  '/': 'public/index.html', 
  '/style.css': 'public/style.css', 
  '/app.js': 'public/app.js', 
  '/upgrade.css': 'public/upgrade.css', 
  '/upgrade.js': 'public/upgrade.js' 
};

function seed() {
  return { 
    users: [
      { id: '1', name: 'Alex Morgan', email: 'alex@example.com', team: 'product', role: 'leader', title: 'Project Manager', points: 150, salt: '', password: '' },
      { id: '2', name: 'Mina Chen', email: 'mina@example.com', team: 'engineers', role: 'teammate', title: 'Software Engineer', points: 220, salt: '', password: '' }
    ], 
    teams: [
      { id: 'product', name: 'Product Studio', icon: 'PS' }, 
      { id: 'engineers', name: 'Platform Engineering', icon: 'PE' }, 
      { id: 'design', name: 'Design Systems', icon: 'DS' }
    ], 
    messages: [
      { id: 1, team: 'product', space: 'general', author: 'Alex Morgan', text: 'Welcome everyone to the general workspace discussion!', at: '09:24', global: true },
      { id: 2, team: 'engineers', space: 'task-1', author: 'Mina Chen', text: 'Task 1 status: standard authentication flow is in progress.', at: '09:31', global: true },
      { id: 3, team: 'product', space: 'fun', author: 'Alex Morgan', text: 'Happy Friday team! Any weekend gaming plans?', at: '09:42', global: true }
    ], 
    tasks: [
      { id: 1, title: 'Finalize Q3 onboarding flow', team: 'product', owner: 'Alex Morgan', due: '2026-08-28', status: 'In progress', assignee: 'AM' },
      { id: 2, title: 'Implement event idempotency', team: 'engineers', owner: 'Mina Chen', due: '2026-08-26', status: 'Review', assignee: 'MC' }
    ], 
    changes: [
      { id: 1, hash: 'a21e8f', title: 'feat: add retry-safe payment mutations', author: 'Mina Chen', file: 'services/payments/mutations.ts', time: '12 min ago', kind: 'Modified' }
    ] 
  };
}

function readData() { 
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seed(), null, 2)); 
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return seed(); } 
}
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => { const i=v.indexOf('='); return [v.slice(0,i).trim(), decodeURIComponent(v.slice(i+1))]; })); }
function user(req) { return sessions.get(parseCookies(req).sid); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(); } }); }); }
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function safeUser(u) { return { id:u.id, name:u.name, email:u.email, team:u.team, role:u.role||'teammate', title:u.title||'Teammate', points:u.points||0 }; }
function requireUser(req,res) { const u=user(req); if (!u) { json(res,401,{error:'Please sign in to continue.'}); return null; } return u; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && publicFiles[url.pathname]) { 
      const file=path.join(ROOT, publicFiles[url.pathname]); 
      const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html'; 
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); 
      if(url.pathname==='/'){
        return res.end(fs.readFileSync(file,'utf8').replace('</body>','<link rel="stylesheet" href="/upgrade.css"><style>[hidden]{display:none!important}</style><script>document.addEventListener("DOMContentLoaded",()=>{const m=document.getElementById("modal");if(m)m.addEventListener("click",e=>{if(e.target===m)m.hidden=true})})</script><script src="/upgrade.js"></script></body>'));
      } 
      return fs.createReadStream(file).pipe(res); 
    }
    
    if (!url.pathname.startsWith('/api/')) return json(res,404,{error:'Not found'});
    const data = readData();

    if (req.method==='POST' && url.pathname==='/api/auth/signup') { 
      const b=await body(req); 
      if (!b.name || !b.email || !b.password || !b.team) return json(res,400,{error:'Complete every field.'}); 
      if (data.users.some(x=>x.email===b.email.toLowerCase())) return json(res,409,{error:'That email is already registered.'}); 
      const p=passwordHash(b.password); 
      const u={
        id:crypto.randomUUID(),
        name:b.name.trim(),
        email:b.email.toLowerCase(),
        team:b.team,
        role:b.role === 'leader' ? 'leader' : 'teammate',
        title:b.title || (b.role === 'leader' ? 'Project Manager' : 'Software Engineer'),
        points: 0,
        salt:p.salt,
        password:p.hash
      }; 
      data.users.push(u);
      writeData(data);
      const sid=crypto.randomUUID();
      sessions.set(sid,safeUser(u));
      res.setHeader('Set-Cookie',`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
      return json(res,201,{user:safeUser(u)}); 
    }

    if (req.method==='POST' && url.pathname==='/api/auth/signin') { 
      const b=await body(req); 
      const u=data.users.find(x=>x.email===String(b.email).toLowerCase()); 
      if(!u || passwordHash(b.password,u.salt).hash!==u.password) return json(res,401,{error:'Incorrect email or password.'});
      const sid=crypto.randomUUID();
      sessions.set(sid,safeUser(u));
      res.setHeader('Set-Cookie',`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
      return json(res,200,{user:safeUser(u)}); 
    }

    if (req.method==='POST' && url.pathname==='/api/auth/signout') { 
      sessions.delete(parseCookies(req).sid);
      res.setHeader('Set-Cookie','sid=; HttpOnly; Path=/; Max-Age=0');
      return json(res,200,{ok:true}); 
    }

    if (req.method==='GET' && url.pathname==='/api/auth/me') { 
      const u=requireUser(req,res);
      if(u) json(res,200,{user:safeUser(data.users.find(x=>x.id===u.id)||u), teams:data.teams});
      return; 
    }

    const u=requireUser(req,res); if(!u) return;

    if(req.method==='GET' && url.pathname==='/api/dashboard') {
      const sortedLeaderboard = [...data.users]
        .map(safeUser)
        .sort((a,b) => b.points - a.points);
      return json(res,200,{teams:data.teams, messages:data.messages, tasks:data.tasks, changes:data.changes, leaderboard:sortedLeaderboard});
    }

    if(req.method==='POST' && url.pathname==='/api/messages') { 
      const b=await body(req); 
      if(!b.text?.trim()) return json(res,400,{error:'Message cannot be empty.'}); 
      const m={
        id:Date.now(),
        team:b.team||u.team,
        space:b.space||'general',
        author:u.name,
        text:b.text.trim(),
        at:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
        global:true
      };
      data.messages.push(m);
      writeData(data);
      return json(res,201,{message:m}); 
    }

    if(req.method==='POST' && url.pathname==='/api/tasks') { 
      if (u.role !== 'leader') return json(res,403,{error:'Only Leaders / Project Managers can create tasks.'});
      const b=await body(req);
      if(!b.title?.trim()||!b.due) return json(res,400,{error:'Task name and deadline are required.'});
      const t={
        id:Date.now(),
        title:b.title.trim(),
        team:b.team||u.team,
        owner:u.name,
        due:b.due,
        status:'Planned',
        assignee:u.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()
      };
      data.tasks.push(t);
      writeData(data);
      return json(res,201,{task:t}); 
    }

    if(req.method==='POST' && url.pathname==='/api/tasks/submit') {
      const b=await body(req);
      const task = data.tasks.find(t => t.id === Number(b.taskId));
      if (!task) return json(res,404,{error:'Task not found.'});
      if (task.status === 'Done') return json(res,400,{error:'Task is already marked as finished.'});

      task.status = 'Done';
      let pointsEarned = 100;

      const today = new Date().toISOString().split('T')[0];
      if (task.due && today <= task.due) {
        pointsEarned += 50;
      }

      const dbUser = data.users.find(x => x.id === u.id);
      if (dbUser) {
        dbUser.points = (dbUser.points || 0) + pointsEarned;
        u.points = dbUser.points;
      }

      writeData(data);
      return json(res,200,{task, pointsEarned, totalPoints: dbUser?.points || 0});
    }

    if(req.method==='POST' && url.pathname==='/api/changes') { 
      const b=await body(req);
      if(!b.title?.trim()||!b.file?.trim()) return json(res,400,{error:'Change title and file are required.'});
      const c={id:Date.now(),hash:crypto.randomBytes(3).toString('hex'),title:b.title.trim(),file:b.file.trim(),kind:b.kind||'Modified',author:u.name,time:'Just now'};
      data.changes.unshift(c);
      writeData(data);
      return json(res,201,{change:c}); 
    }

    if(req.method==='POST' && url.pathname==='/api/explain') { 
      const b=await body(req); 
      const t=String(b.text||''); 
      let explanation; 
      let source='Nexus local explainer'; 
      if (process.env.GEMINI_API_KEY) { 
        const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AQ.Ab8RN6I4j6TOY-EmX5B9Mp6JHrPxfuPjQ7UfmLhaOLwUjXZW8Q`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:`Explain this company chat message in plain, concise language: ${t}`}]}]})}); 
        const gemini=await response.json(); 
        if(response.ok && gemini.candidates?.[0]?.content?.parts?.[0]?.text){explanation=gemini.candidates[0].content.parts[0].text;source='Gemini AI';} 
      }
      if(!explanation) explanation='In plain language: '+t.replace(/\b(FYI|published|experiment|activation metric)\b/gi,'').trim()+'.'; 
      return json(res,200,{explanation,source}); 
    }

    return json(res,404,{error:'Not found'});
  } catch (e) { console.error(e); return json(res,500,{error:'Something went wrong.'}); }
}).listen(PORT, () => console.log(`Nexus workspace ready on port ${PORT}`));
