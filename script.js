/* ============================================================
   VOTECAST — CORE JAVASCRIPT  v2.0
   Handles:
     • User registration with unique passcode generation
     • Voter login (username + generated passcode)
     • Admin login (separate hardcoded credentials)
     • Voting logic (one vote per registered voter)
     • Public results dashboard (voters only, read-only)
     • Admin panel:
         – View live results + chart
         – Add / remove candidates
         – View / remove registered users
         – Reset all votes (admin-only)
   ============================================================ */

"use strict";

/* ──────────────────────────────────────────────────────────
   STORAGE KEYS
   ────────────────────────────────────────────────────────── */
const SK = {
  SESSION:    'vc_session',     // { username, role, loginAt }
  USERS:      'vc_users',       // [ { username, passcode, registeredAt } ]
  CANDIDATES: 'vc_candidates',  // [ { id, name, party, slogan, color, bg, initials } ]
  VOTES:      'vc_votes',       // { candidateId: count }
  VOTED_BY:   'vc_voted_by',    // { username: candidateId }
};

/* ──────────────────────────────────────────────────────────
   ADMIN CREDENTIALS  (hardcoded – server-side in production)
   ────────────────────────────────────────────────────────── */
const ADMIN = { username:'admin', password:'Admin@2024!', role:'admin' };

/* ──────────────────────────────────────────────────────────
   COLOUR PALETTES for dynamically added candidates
   ────────────────────────────────────────────────────────── */
const PALETTES = [
  { color:'#63b3ed', bg:'linear-gradient(135deg,#2b6cb0,#63b3ed)' },
  { color:'#f6ad55', bg:'linear-gradient(135deg,#c05621,#f6ad55)' },
  { color:'#68d391', bg:'linear-gradient(135deg,#276749,#68d391)' },
  { color:'#b794f4', bg:'linear-gradient(135deg,#553c9a,#b794f4)' },
  { color:'#fc8181', bg:'linear-gradient(135deg,#c53030,#fc8181)' },
  { color:'#4fd1c5', bg:'linear-gradient(135deg,#285e61,#4fd1c5)' },
  { color:'#f687b3', bg:'linear-gradient(135deg,#97266d,#f687b3)' },
  { color:'#fbd38d', bg:'linear-gradient(135deg,#975a16,#fbd38d)' },
];

/* ──────────────────────────────────────────────────────────
   DEFAULT CANDIDATES (seeded on first ever run)
   ────────────────────────────────────────────────────────── */
const DEFAULT_CANDIDATES = [
  { id:'c1', name:'Eleanor Hartwell', party:'Progressive Alliance',
    slogan:'"A brighter, fairer tomorrow for all citizens."',
    color:'#63b3ed', bg:'linear-gradient(135deg,#2b6cb0,#63b3ed)', initials:'EH' },
  { id:'c2', name:'Marcus Rhodes', party:'Liberty Front',
    slogan:'"Freedom, prosperity, and strong communities."',
    color:'#f6ad55', bg:'linear-gradient(135deg,#c05621,#f6ad55)', initials:'MR' },
  { id:'c3', name:'Amara Osei', party:"People's Voice",
    slogan:'"United we stand, divided we fall."',
    color:'#68d391', bg:'linear-gradient(135deg,#276749,#68d391)', initials:'AO' },
  { id:'c4', name:'Victor Sandoval', party:'Renewal Party',
    slogan:'"Rebuilding trust, one promise at a time."',
    color:'#b794f4', bg:'linear-gradient(135deg,#553c9a,#b794f4)', initials:'VS' },
  { id:'c5', name:'Priya Mehra', party:'Future Coalition',
    slogan:'"Science, innovation, and sustainable growth."',
    color:'#fc8181', bg:'linear-gradient(135deg,#c53030,#fc8181)', initials:'PM' },
];

/* ──────────────────────────────────────────────────────────
   STORAGE HELPERS
   ────────────────────────────────────────────────────────── */
function storageGet(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function storageSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function storageRemove(key)   { localStorage.removeItem(key); }

/* ──────────────────────────────────────────────────────────
   SEED DEFAULTS (runs once)
   ────────────────────────────────────────────────────────── */
function seedDefaults() {
  if (!storageGet(SK.CANDIDATES)) storageSet(SK.CANDIDATES, DEFAULT_CANDIDATES);
  if (!storageGet(SK.USERS))      storageSet(SK.USERS, []);
  if (!storageGet(SK.VOTES))      storageSet(SK.VOTES, {});
  if (!storageGet(SK.VOTED_BY))   storageSet(SK.VOTED_BY, {});
}

/* ──────────────────────────────────────────────────────────
   PASSCODE GENERATOR
   Format: "ABC-DEFG"  (no ambiguous chars like 0/O 1/I)
   ────────────────────────────────────────────────────────── */
function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) {
    if (i === 3) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. "XKP-2MQA"
}

/* ──────────────────────────────────────────────────────────
   USER MANAGEMENT
   ────────────────────────────────────────────────────────── */
function getUsers()        { return storageGet(SK.USERS) || []; }
function findUser(uname)   { return getUsers().find(u => u.username.toLowerCase() === uname.toLowerCase()); }

/** Register a new voter. Returns { ok, username, passcode, error } */
function registerUser(username) {
  const clean = username.trim();
  if (!clean)                              return { ok:false, error:'Username is required.' };
  if (clean.length < 3)                   return { ok:false, error:'At least 3 characters required.' };
  if (clean.length > 24)                  return { ok:false, error:'24 characters maximum.' };
  if (!/^[a-zA-Z0-9_]+$/.test(clean))    return { ok:false, error:'Letters, numbers and underscores only.' };
  if (clean.toLowerCase() === 'admin')    return { ok:false, error:'"admin" is a reserved username.' };
  if (findUser(clean))                    return { ok:false, error:'Username already taken.' };

  const passcode = generatePasscode();
  const users    = getUsers();
  users.push({ username: clean, passcode, registeredAt: Date.now() });
  storageSet(SK.USERS, users);
  return { ok:true, username: clean, passcode };
}

/** Admin removes a user (and reverses their vote from the tally) */
function removeUser(username) {
  let users = getUsers().filter(u => u.username.toLowerCase() !== username.toLowerCase());
  storageSet(SK.USERS, users);

  const votedBy = storageGet(SK.VOTED_BY) || {};
  const key     = username.toLowerCase();
  const candId  = votedBy[key];
  if (candId) {
    const votes = storageGet(SK.VOTES) || {};
    if (votes[candId] > 0) votes[candId]--;
    storageSet(SK.VOTES, votes);
    delete votedBy[key];
    storageSet(SK.VOTED_BY, votedBy);
  }
}

/* ──────────────────────────────────────────────────────────
   AUTH
   ────────────────────────────────────────────────────────── */
function getSession()  { return storageGet(SK.SESSION); }
function isLoggedIn()  { return !!getSession(); }
function isAdmin()     { const s = getSession(); return s && s.role === 'admin'; }

/** Voter login: username + passcode */
function loginVoter(username, passcode) {
  if (!username || !passcode) return { ok:false, error:'All fields are required.' };
  const user = findUser(username);
  if (!user || user.passcode !== passcode.toUpperCase().replace(/\s|-/g, '').replace(/(.{3})(.{4})/, '$1-$2'))
    // normalise input then compare
    return { ok:false, error:'Username or passcode is incorrect.' };
  // second attempt with raw comparison
  if (user.passcode !== passcode.trim().toUpperCase()) {
    // try stripping dash and re-inserting
    const raw = passcode.trim().toUpperCase().replace(/-/g,'');
    const formatted = raw.slice(0,3) + '-' + raw.slice(3);
    if (user.passcode !== formatted) return { ok:false, error:'Username or passcode is incorrect.' };
  }
  const session = { username: user.username, role:'voter', loginAt: Date.now() };
  storageSet(SK.SESSION, session);
  return { ok:true, session };
}

/** Admin login: username + password */
function loginAdmin(username, password) {
  if (!username || !password) return { ok:false, error:'All fields are required.' };
  if (username.trim().toLowerCase() !== ADMIN.username || password !== ADMIN.password)
    return { ok:false, error:'Invalid admin credentials.' };
  const session = { username: ADMIN.username, role:'admin', loginAt: Date.now() };
  storageSet(SK.SESSION, session);
  return { ok:true, session };
}

/** Clear session and go to login */
function logout() {
  storageRemove(SK.SESSION);
  window.location.href = 'login.html';
}

/* ──────────────────────────────────────────────────────────
   CANDIDATE MANAGEMENT
   ────────────────────────────────────────────────────────── */
function getCandidates() { return storageGet(SK.CANDIDATES) || []; }

/** Admin adds a new candidate. Returns { ok, candidate, error } */
function addCandidate({ name, party, slogan }) {
  if (!name  || !name.trim())  return { ok:false, error:'Candidate name is required.' };
  if (!party || !party.trim()) return { ok:false, error:'Party name is required.' };
  const candidates = getCandidates();
  if (candidates.find(c => c.name.toLowerCase() === name.trim().toLowerCase()))
    return { ok:false, error:'A candidate with that name already exists.' };

  const pal      = PALETTES[candidates.length % PALETTES.length];
  const words    = name.trim().split(/\s+/);
  const initials = (words[0][0] + (words[1] ? words[1][0] : words[0][1] || '')).toUpperCase();
  const id       = 'c' + Date.now();
  const candidate = {
    id, initials, color: pal.color, bg: pal.bg,
    name:   name.trim(),
    party:  party.trim(),
    slogan: slogan?.trim() ? `"${slogan.trim()}"` : '"Standing for the people."',
  };
  candidates.push(candidate);
  storageSet(SK.CANDIDATES, candidates);

  /* Init vote counter */
  const votes = storageGet(SK.VOTES) || {};
  votes[id] = 0;
  storageSet(SK.VOTES, votes);

  return { ok:true, candidate };
}

/** Admin removes a candidate (and their votes) */
function removeCandidate(id) {
  storageSet(SK.CANDIDATES, getCandidates().filter(c => c.id !== id));
  const votes = storageGet(SK.VOTES) || {};
  delete votes[id];
  storageSet(SK.VOTES, votes);
  const votedBy = storageGet(SK.VOTED_BY) || {};
  Object.keys(votedBy).forEach(u => { if (votedBy[u] === id) delete votedBy[u]; });
  storageSet(SK.VOTED_BY, votedBy);
}

/* ──────────────────────────────────────────────────────────
   VOTING LOGIC
   ────────────────────────────────────────────────────────── */
function getVotes() {
  const stored = storageGet(SK.VOTES) || {};
  const out    = {};
  getCandidates().forEach(c => { out[c.id] = stored[c.id] || 0; });
  return out;
}
function getVotedBy()          { return storageGet(SK.VOTED_BY) || {}; }
function hasVoted(uname)       { return !!getVotedBy()[uname.toLowerCase()]; }
function getUserVote(uname)    { return getVotedBy()[uname.toLowerCase()] || null; }
function getTotalVotes(votes)  { return Object.values(votes).reduce((s,v)=>s+v,0); }

/** Cast a vote. Admins are blocked. Returns { ok, candidate, error } */
function castVote(candidateId) {
  const s = getSession();
  if (!s)               return { ok:false, error:'You must be logged in to vote.' };
  if (s.role==='admin') return { ok:false, error:'Admins cannot vote.' };
  if (hasVoted(s.username)) return { ok:false, error:'You have already cast your vote.' };
  const candidate = getCandidates().find(c => c.id === candidateId);
  if (!candidate)       return { ok:false, error:'Invalid candidate.' };
  const votes = storageGet(SK.VOTES) || {};
  votes[candidateId] = (votes[candidateId]||0) + 1;
  storageSet(SK.VOTES, votes);
  const votedBy = getVotedBy();
  votedBy[s.username.toLowerCase()] = candidateId;
  storageSet(SK.VOTED_BY, votedBy);
  return { ok:true, candidate };
}

/** Admin-only: reset all vote data */
function resetVotes() {
  const fresh = {};
  getCandidates().forEach(c => { fresh[c.id] = 0; });
  storageSet(SK.VOTES, fresh);
  storageSet(SK.VOTED_BY, {});
}

/** Returns leading candidate or null (tie / no votes) */
function getWinner(votes) {
  const cands = getCandidates();
  if (!cands.length || getTotalVotes(votes)===0) return null;
  const sorted = [...cands].sort((a,b)=>(votes[b.id]||0)-(votes[a.id]||0));
  if ((votes[sorted[0].id]||0) === (votes[sorted[1]?.id]||0)) return null;
  return sorted[0];
}

/* ──────────────────────────────────────────────────────────
   TOAST SYSTEM
   ────────────────────────────────────────────────────────── */
const TOAST_ICONS = { success:'✓', error:'✕', info:'ℹ', warn:'!' };

function showToast({ type='info', title='', message='', duration=4000 } = {}) {
  let box = document.getElementById('toast-container');
  if (!box) { box = document.createElement('div'); box.id='toast-container'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type]}</div>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">×</button>`;
  const dismiss = () => {
    t.classList.add('removing');
    t.addEventListener('animationend', () => t.remove(), {once:true});
  };
  t.querySelector('.toast-close').addEventListener('click', dismiss);
  box.appendChild(t);
  if (duration > 0) setTimeout(dismiss, duration);
}

/* ──────────────────────────────────────────────────────────
   CONFIRM MODAL
   ────────────────────────────────────────────────────────── */
function showConfirm({ icon='⚠️', title='Are you sure?', message='',
                       confirmLabel='Confirm', cancelLabel='Cancel' } = {}) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-icon">${icon}</div><h3>${title}</h3><p>${message}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mc">${cancelLabel}</button>
        <button class="btn btn-danger" id="mok">${confirmLabel}</button>
      </div></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    const done = r => {
      ov.classList.remove('open');
      ov.addEventListener('transitionend', () => ov.remove(), {once:true});
      resolve(r);
    };
    ov.querySelector('#mok').addEventListener('click', () => done(true));
    ov.querySelector('#mc') .addEventListener('click', () => done(false));
    ov.addEventListener('click', e => { if (e.target===ov) done(false); });
  });
}

/* ──────────────────────────────────────────────────────────
   RIPPLE ANIMATION
   ────────────────────────────────────────────────────────── */
function playVoteAnimation() {
  const el = document.createElement('div'); el.className='vote-ripple';
  const c  = document.createElement('div'); c.className='ripple-circle';
  el.appendChild(c); document.body.appendChild(el);
  c.addEventListener('animationend', () => el.remove(), {once:true});
}

/* ──────────────────────────────────────────────────────────
   AVATAR HELPER
   ────────────────────────────────────────────────────────── */
function renderAvatar(c, cls='candidate-avatar') {
  return `<div class="${cls}"><div class="avatar-fallback" style="background:${c.bg}">${c.initials}</div></div>`;
}

/* ──────────────────────────────────────────────────────────
   SHARED FORM HELPERS
   ────────────────────────────────────────────────────────── */
function setFieldError(input, errId, msg) {
  input.classList.add('error');
  const el = document.getElementById(errId);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function clearFieldError(input, errId) {
  input.classList.remove('error');
  const el = document.getElementById(errId);
  if (el) el.classList.remove('show');
}

/* ══════════════════════════════════════════════════════════
   PAGE: REGISTER  (register.html)
   ══════════════════════════════════════════════════════════ */
function initRegisterPage() {
  if (isLoggedIn()) { window.location.href = isAdmin() ? 'admin.html' : 'index.html'; return; }

  const form       = document.getElementById('register-form');
  const nameIn     = document.getElementById('reg-username');
  const submitBtn  = document.getElementById('reg-btn');
  const resultBox  = document.getElementById('passcode-result');
  const pcDisplay  = document.getElementById('passcode-display');
  const copyBtn    = document.getElementById('copy-btn');

  nameIn.addEventListener('input', () => clearFieldError(nameIn, 'reg-username-error'));

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!nameIn.value.trim()) { setFieldError(nameIn,'reg-username-error','Username is required.'); return; }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Creating…';

    setTimeout(() => {
      const res = registerUser(nameIn.value);
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Create Account';
      if (!res.ok) {
        setFieldError(nameIn,'reg-username-error',res.error);
        showToast({ type:'error', title:'Registration failed', message:res.error });
        return;
      }
      form.style.display   = 'none';
      pcDisplay.textContent = res.passcode;
      resultBox.style.display = 'block';
      showToast({ type:'success', title:'Account created!', message:'Save your passcode — it\'s your key to vote.' });
    }, 500);
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(pcDisplay.textContent).then(() => {
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Passcode'; }, 2000);
      }).catch(() => {
        // fallback for browsers without clipboard API
        showToast({ type:'info', title:'Copy manually', message: pcDisplay.textContent });
      });
    });
  }
}

/* ══════════════════════════════════════════════════════════
   PAGE: VOTER LOGIN  (login.html)
   ══════════════════════════════════════════════════════════ */
function initLoginPage() {
  if (isLoggedIn()) { window.location.href = isAdmin() ? 'admin.html' : 'index.html'; return; }

  const form     = document.getElementById('login-form');
  const userIn   = document.getElementById('username');
  const pcIn     = document.getElementById('passcode');
  const toggle   = document.getElementById('toggle-password');
  const loginBtn = document.getElementById('login-btn');

  if (toggle) {
    toggle.addEventListener('click', () => {
      pcIn.type = pcIn.type==='text' ? 'password' : 'text';
      toggle.textContent = pcIn.type==='text' ? '🙈' : '👁';
    });
  }

  userIn.addEventListener('input', () => clearFieldError(userIn,'username-error'));
  pcIn  .addEventListener('input', () => clearFieldError(pcIn,'passcode-error'));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const username = userIn.value.trim();
    const passcode = pcIn.value.trim();
    let valid = true;
    if (!username) { setFieldError(userIn,'username-error','Username is required.'); valid=false; }
    if (!passcode) { setFieldError(pcIn,'passcode-error','Passcode is required.'); valid=false; }
    if (!valid) return;

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<div class="spinner"></div> Signing in…';

    setTimeout(() => {
      /* Normalise passcode: uppercase, ensure dash at pos 3 */
      const raw = passcode.toUpperCase().replace(/-/g,'');
      const normalised = raw.slice(0,3) + '-' + raw.slice(3);

      const user = findUser(username);
      let ok = false;
      if (user && (user.passcode === normalised || user.passcode === passcode.trim().toUpperCase())) {
        const session = { username: user.username, role:'voter', loginAt: Date.now() };
        storageSet(SK.SESSION, session);
        ok = true;
        showToast({ type:'success', title:'Welcome!', message:`Signed in as ${user.username}` });
        setTimeout(() => { window.location.href='index.html'; }, 700);
      }

      if (!ok) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Sign In →';
        setFieldError(userIn,'username-error','Username or passcode is incorrect.');
        setFieldError(pcIn,'passcode-error','Username or passcode is incorrect.');
        showToast({ type:'error', title:'Login failed', message:'Username or passcode is incorrect.' });
      }
    }, 600);
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE: ADMIN LOGIN  (admin-login.html)
   ══════════════════════════════════════════════════════════ */
function initAdminLoginPage() {
  if (isAdmin())     { window.location.href='admin.html'; return; }
  if (isLoggedIn())  { logout(); return; }

  const form     = document.getElementById('admin-login-form');
  const userIn   = document.getElementById('admin-username');
  const passIn   = document.getElementById('admin-password');
  const toggle   = document.getElementById('toggle-password');
  const loginBtn = document.getElementById('admin-login-btn');

  if (toggle) {
    toggle.addEventListener('click', () => {
      passIn.type = passIn.type==='text' ? 'password' : 'text';
      toggle.textContent = passIn.type==='text' ? '🙈' : '👁';
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<div class="spinner"></div> Authenticating…';
    setTimeout(() => {
      const res = loginAdmin(userIn.value.trim(), passIn.value);
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'Admin Sign In →';
      if (!res.ok) {
        setFieldError(userIn,'admin-user-error',res.error);
        setFieldError(passIn,'admin-pass-error',res.error);
        showToast({ type:'error', title:'Access denied', message:res.error });
        return;
      }
      showToast({ type:'success', title:'Admin access granted', message:'Redirecting…' });
      setTimeout(() => { window.location.href='admin.html'; }, 700);
    }, 600);
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE: VOTING  (index.html)
   ══════════════════════════════════════════════════════════ */
function initVotingPage() {
  if (!isLoggedIn()) { window.location.href='login.html'; return; }
  if (isAdmin())     { window.location.href='admin.html'; return; }

  const session    = getSession();
  const grid       = document.getElementById('candidates-grid');
  const userLabel  = document.getElementById('user-label');
  const logoutBtn  = document.getElementById('logout-btn');
  const resultsBtn = document.getElementById('results-btn');

  if (userLabel)  userLabel.textContent = `@${session.username}`;
  if (logoutBtn)  logoutBtn.addEventListener('click', logout);
  if (resultsBtn) resultsBtn.addEventListener('click', () => { window.location.href='dashboard.html'; });

  function renderCards() {
    const candidates = getCandidates();
    const myVote     = getUserVote(session.username);
    grid.innerHTML   = '';

    if (!candidates.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🗳️</div><p>No candidates have been added yet.</p></div>`;
      return;
    }

    candidates.forEach(c => {
      const isMyVote     = myVote === c.id;
      const alreadyVoted = !!myVote;
      const card = document.createElement('div');
      card.className = `candidate-card${isMyVote?' voted-card':''}`;
      card.innerHTML = `
        ${renderAvatar(c)}
        <span class="party-badge" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}44">${c.party}</span>
        <div class="candidate-name">${c.name}</div>
        <div class="candidate-slogan">${c.slogan}</div>
        ${isMyVote
          ? `<div class="voted-badge">✓ Your Vote</div>`
          : alreadyVoted
            ? `<button class="btn btn-ghost vote-btn" disabled style="opacity:.4;cursor:not-allowed">Already Voted</button>`
            : `<button class="btn btn-primary vote-btn" data-id="${c.id}">Cast Vote</button>`}`;
      if (!alreadyVoted) {
        const btn = card.querySelector('[data-id]');
        if (btn) btn.addEventListener('click', () => handleVote(c.id));
      }
      grid.appendChild(card);
    });
  }

  async function handleVote(candidateId) {
    const c = getCandidates().find(x => x.id === candidateId);
    const confirmed = await showConfirm({
      icon:'🗳️', title:'Confirm your vote',
      message:`You are about to vote for <strong>${c.name}</strong> (${c.party}).<br><br>This <strong>cannot be undone</strong>.`,
      confirmLabel:'Yes, cast my vote', cancelLabel:'Go back',
    });
    if (!confirmed) return;

    const result = castVote(candidateId);
    if (!result.ok) { showToast({ type:'error', title:'Vote failed', message:result.error }); return; }

    playVoteAnimation();
    showToast({ type:'success', title:'🎉 Vote cast!', message:`You voted for ${result.candidate.name}.`, duration:5000 });
    renderCards();
  }

  renderCards();
}

/* ══════════════════════════════════════════════════════════
   PAGE: RESULTS DASHBOARD  (dashboard.html) — voters only
   ══════════════════════════════════════════════════════════ */
let chartInstance = null;

function initDashboardPage() {
  if (!isLoggedIn()) { window.location.href='login.html'; return; }
  if (isAdmin())     { window.location.href='admin.html'; return; }

  const session   = getSession();
  const userLabel = document.getElementById('user-label');
  const backBtn   = document.getElementById('back-btn');
  const logoutBtn = document.getElementById('logout-btn');

  if (userLabel)  userLabel.textContent = `@${session.username}`;
  if (backBtn)    backBtn.addEventListener('click', () => { window.location.href='index.html'; });
  if (logoutBtn)  logoutBtn.addEventListener('click', logout);

  loadResults();
}

function loadResults() {
  const votes      = getVotes();
  const total      = getTotalVotes(votes);
  const winner     = getWinner(votes);
  const candidates = getCandidates();

  const elTotal  = document.getElementById('stat-total');
  const elCands  = document.getElementById('stat-candidates');
  const elWinner = document.getElementById('stat-winner');

  if (elTotal)  elTotal.textContent  = total;
  if (elCands)  elCands.textContent  = candidates.length;
  if (elWinner) elWinner.textContent = winner ? winner.name.split(' ')[0] : '—';

  renderWinnerBanner(winner, votes);
  renderResultRows(votes, total, winner);
  renderChart(votes, candidates);
}

function renderWinnerBanner(winner, votes) {
  const banner = document.getElementById('winner-banner');
  if (!banner) return;
  if (!winner) {
    const total = getTotalVotes(votes);
    banner.innerHTML = `<div class="empty-state" style="padding:24px">
      <div class="empty-icon">${total===0?'🗳️':'⚖️'}</div>
      <p>${total===0?'No votes have been cast yet.':"It's a tie — no winner yet."}</p></div>`;
    return;
  }
  const pct = getTotalVotes(votes) > 0 ? Math.round((votes[winner.id]/getTotalVotes(votes))*100) : 0;
  banner.innerHTML = `
    <div class="winner-avatar"><div class="winner-avatar-fallback" style="background:${winner.bg}">${winner.initials}</div></div>
    <div class="winner-info">
      <div class="winner-label">🏆 Current Leader</div>
      <div class="winner-name">${winner.name}</div>
      <div class="winner-votes">${winner.party} · ${votes[winner.id]} vote${votes[winner.id]!==1?'s':''} (${pct}%)</div>
    </div>
    <div class="winner-trophy">🥇</div>`;
}

function renderResultRows(votes, total, winner) {
  const container  = document.getElementById('result-rows');
  if (!container) return;
  const candidates = getCandidates();
  if (!candidates.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🗳️</div><p>No candidates yet.</p></div>`;
    return;
  }
  const sorted = [...candidates].sort((a,b)=>(votes[b.id]||0)-(votes[a.id]||0));
  container.innerHTML = sorted.map(c => {
    const v   = votes[c.id] || 0;
    const pct = total>0 ? Math.round((v/total)*100) : 0;
    const win = winner && winner.id===c.id;
    return `
      <div class="result-row">
        <div class="result-avatar"><div class="result-avatar-fallback" style="background:${c.bg}">${c.initials}</div></div>
        <div class="result-info">
          <div class="result-name">
            ${c.name} ${win?'<span class="winner-crown">👑</span>':''}
            <span class="chip" style="margin-left:auto;background:${c.color}18;color:${c.color};border:1px solid ${c.color}33">${pct}%</span>
          </div>
          <div class="result-bar-wrap">
            <div class="result-bar-fill${win?' winner':''}"
                 style="width:${pct}%;${win?'':'background:linear-gradient(90deg,'+c.color+'99,'+c.color+')'}"></div>
          </div>
        </div>
        <div class="result-votes">${v}</div>
      </div>`;
  }).join('');
}

function renderChart(votes, candidates) {
  const canvas = document.getElementById('results-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  candidates = candidates || getCandidates();
  const labels      = candidates.map(c => c.name.split(' ')[0]);
  const data        = candidates.map(c => votes[c.id]||0);
  const colors      = candidates.map(c => c.color);
  const alphaColors = candidates.map(c => c.color+'33');

  if (chartInstance) {
    chartInstance.data.labels                      = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = alphaColors;
    chartInstance.data.datasets[0].borderColor     = colors;
    chartInstance.update('active');
    return;
  }
  Chart.defaults.color       = '#718096';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  chartInstance = new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Votes', data, backgroundColor:alphaColors,
           borderColor:colors, borderWidth:2, borderRadius:8, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:800, easing:'easeOutQuart' },
      plugins:{
        legend:{ display:false },
        tooltip:{ backgroundColor:'#131928', borderColor:'rgba(255,255,255,0.07)',
          borderWidth:1, titleColor:'#edf2f7', bodyColor:'#718096', padding:12,
          callbacks:{ label:ctx=>`  ${ctx.parsed.y} vote${ctx.parsed.y!==1?'s':''}` } },
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#718096'}, border:{color:'rgba(255,255,255,0.06)'} },
        y:{ beginAtZero:true, grid:{color:'rgba(255,255,255,0.04)'},
            ticks:{color:'#718096',stepSize:1,precision:0}, border:{color:'rgba(255,255,255,0.06)'} },
      },
    },
  });
}

/* ══════════════════════════════════════════════════════════
   PAGE: ADMIN PANEL  (admin.html)
   ══════════════════════════════════════════════════════════ */
function initAdminPage() {
  if (!isLoggedIn()) { window.location.href='admin-login.html'; return; }
  if (!isAdmin())    { window.location.href='index.html'; return; }

  /* Tab navigation */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn')  .forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab)?.classList.add('active');
    });
  });

  document.getElementById('admin-logout-btn')?.addEventListener('click', logout);

  renderAdminOverview();
  renderAdminCandidates();
  renderAdminUsers();
  initAddCandidateForm();

  document.getElementById('admin-reset-btn')?.addEventListener('click', async () => {
    const ok = await showConfirm({
      icon:'🔄', title:'Reset all votes?',
      message:'This will permanently clear <strong>all vote counts and voting records</strong>. Candidates are kept. This cannot be undone.',
      confirmLabel:'Yes, reset votes', cancelLabel:'Keep votes',
    });
    if (!ok) return;
    resetVotes();
    if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
    renderAdminOverview();
    renderAdminCandidates();
    renderAdminUsers();
    showToast({ type:'warn', title:'Votes reset', message:'All vote data has been cleared.', duration:5000 });
  });
}

/* Admin: Overview / Results tab */
function renderAdminOverview() {
  const votes     = getVotes();
  const total     = getTotalVotes(votes);
  const winner    = getWinner(votes);
  const candidates= getCandidates();

  const el = id => document.getElementById(id);
  if (el('admin-stat-total'))      el('admin-stat-total').textContent      = total;
  if (el('admin-stat-candidates')) el('admin-stat-candidates').textContent = candidates.length;
  if (el('admin-stat-users'))      el('admin-stat-users').textContent      = getUsers().length;
  if (el('admin-stat-winner'))     el('admin-stat-winner').textContent     = winner ? winner.name.split(' ')[0] : '—';

  renderWinnerBanner(winner, votes);
  renderResultRows(votes, total, winner);
  renderChart(votes, candidates);
}

/* Admin: Candidates management tab */
function renderAdminCandidates() {
  const list = document.getElementById('admin-candidates-list');
  if (!list) return;
  const candidates = getCandidates();
  const votes      = getVotes();
  const total      = getTotalVotes(votes);

  if (!candidates.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗳️</div><p>No candidates yet. Add one below.</p></div>`;
    return;
  }

  list.innerHTML = candidates.map(c => {
    const v   = votes[c.id] || 0;
    const pct = total > 0 ? Math.round((v/total)*100) : 0;
    return `
      <div class="admin-row">
        <div class="result-avatar"><div class="result-avatar-fallback" style="background:${c.bg}">${c.initials}</div></div>
        <div class="result-info">
          <div class="result-name">${c.name}
            <span class="chip chip-blue" style="font-size:.68rem;background:${c.color}18;color:${c.color};border-color:${c.color}33">${c.party}</span>
          </div>
          <div class="result-bar-wrap" style="margin-top:6px">
            <div class="result-bar-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
        </div>
        <div class="result-votes">${v} <span style="font-size:.72rem;color:var(--text-dim)">vote${v!==1?'s':''}</span></div>
        <button class="btn btn-danger btn-sm" onclick="handleRemoveCandidate('${c.id}')">Remove</button>
      </div>`;
  }).join('');
}

window.handleRemoveCandidate = async function(id) {
  const c = getCandidates().find(x=>x.id===id);
  if (!c) return;
  const v = (getVotes()[c.id]||0);
  const ok = await showConfirm({
    icon:'🗑️', title:`Remove ${c.name}?`,
    message:`This will remove the candidate and their <strong>${v} vote${v!==1?'s':''}</strong> from the tally. Cannot be undone.`,
    confirmLabel:'Yes, remove', cancelLabel:'Cancel',
  });
  if (!ok) return;
  removeCandidate(id);
  if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
  renderAdminCandidates();
  renderAdminOverview();
  showToast({ type:'warn', title:'Candidate removed', message:`${c.name} has been removed from the ballot.` });
};

/* Admin: Add candidate form */
function initAddCandidateForm() {
  const form   = document.getElementById('add-candidate-form');
  const nameIn = document.getElementById('cand-name');
  const partyIn= document.getElementById('cand-party');
  const slogIn = document.getElementById('cand-slogan');
  const addBtn = document.getElementById('add-cand-btn');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    addBtn.disabled = true;
    addBtn.innerHTML = '<div class="spinner"></div> Adding…';
    setTimeout(() => {
      const res = addCandidate({ name:nameIn.value, party:partyIn.value, slogan:slogIn.value });
      addBtn.disabled = false;
      addBtn.innerHTML = '+ Add Candidate';
      if (!res.ok) { showToast({ type:'error', title:'Error', message:res.error }); return; }
      nameIn.value=''; partyIn.value=''; slogIn.value='';
      if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
      renderAdminCandidates();
      renderAdminOverview();
      showToast({ type:'success', title:'Candidate added', message:`${res.candidate.name} is now on the ballot.` });
    }, 400);
  });
}

/* Admin: Users management tab */
function renderAdminUsers() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  const users      = getUsers();
  const votedBy    = getVotedBy();
  const candidates = getCandidates();

  if (!users.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No registered voters yet.</p></div>`;
    return;
  }

  list.innerHTML = `
    <div class="table-wrap">
      <table class="users-table">
        <thead><tr>
          <th>Username</th><th>Passcode</th><th>Voted For</th><th>Registered</th><th>Action</th>
        </tr></thead>
        <tbody>
          ${users.map(u => {
            const candId = votedBy[u.username.toLowerCase()];
            const cand   = candId ? candidates.find(c=>c.id===candId) : null;
            const date   = new Date(u.registeredAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
            return `<tr>
              <td><strong>@${u.username}</strong></td>
              <td><code class="passcode-cell">${u.passcode}</code></td>
              <td>${cand
                ? `<span class="chip chip-green" style="font-size:.72rem">✓ ${cand.name.split(' ')[0]}</span>`
                : `<span class="chip chip-blue" style="font-size:.72rem">Not yet</span>`}</td>
              <td style="color:var(--text-dim);font-size:.8rem">${date}</td>
              <td><button class="btn btn-danger btn-sm" onclick="handleRemoveUser('${u.username}')">Remove</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

window.handleRemoveUser = async function(username) {
  const ok = await showConfirm({
    icon:'👤', title:`Remove @${username}?`,
    message:`This deletes their account. If they voted, their vote will also be removed from the tally.`,
    confirmLabel:'Yes, remove user', cancelLabel:'Cancel',
  });
  if (!ok) return;
  removeUser(username);
  renderAdminUsers();
  renderAdminOverview();
  if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
  renderChart(getVotes(), getCandidates());
  showToast({ type:'warn', title:'User removed', message:`@${username} has been removed.` });
};

/* ══════════════════════════════════════════════════════════
   ROUTER
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  seedDefaults();
  const page = window.location.pathname.split('/').pop() || 'index.html';

  if      (page === 'register.html')    initRegisterPage();
  else if (page === 'login.html')       initLoginPage();
  else if (page === 'admin-login.html') initAdminLoginPage();
  else if (page === 'admin.html')       initAdminPage();
  else if (page === 'dashboard.html')   initDashboardPage();
  else                                  initVotingPage();
});
