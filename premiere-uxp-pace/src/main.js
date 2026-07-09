import { createSupabaseClient } from './supabase.js';
import {
  REFRESH_MS,
  formatHMS,
  formatPaceEnd,
  formatShortDate,
  liveItem,
  loadPaceSnapshot,
} from './data.js';

const SUPABASE_URL = __SUPABASE_URL__;
const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
const BOOT_TIMEOUT_MS = 10000;
const PANEL_ID = 'pacePanel';

const client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');

const state = {
  view: 'boot', // boot | login | list | detail
  error: '',
  email: '',
  password: '',
  signingIn: false,
  loading: false,
  snapshot: null,
  selectedId: null,
  now: new Date(),
  lastError: '',
};

let refreshTimer = null;
let tickTimer = null;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function withTimeout(promise, ms, message) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, ms);
    promise.then(
      function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function showFatal(message) {
  if (!app) return;
  app.innerHTML =
    '<div class="shell">' +
    '<div class="banner error">' +
    escapeHtml(message) +
    '</div>' +
    '<p class="hint">Unload/reload the plugin in UXP Developer Tool after rebuilding.</p>' +
    '</div>';
}

function setupPanelMenu() {
  try {
    var entrypoints = require('uxp').entrypoints;
    var panels = {};
    panels[PANEL_ID] = {
      menuItems: [
        { id: 'refresh', label: 'Refresh' },
        { id: 'signOut', label: 'Sign out' },
      ],
      invokeMenu: function (id) {
        if (id === 'refresh') {
          if (state.view === 'login' || state.view === 'boot') return;
          refreshSnapshot();
        } else if (id === 'signOut') {
          onSignOut();
        }
      },
    };
    entrypoints.setup({ panels: panels });
  } catch (err) {
    // Menu setup is best-effort; panel still works without it.
  }
}

function render() {
  if (!app) return;

  if (state.view === 'boot') {
    app.innerHTML = '<div class="boot">Loading…</div>';
    return;
  }

  if (state.view === 'login') {
    app.innerHTML =
      '<div class="shell">' +
      '<form id="login-form" class="login">' +
      '<p class="hint">Sign in with email + password. Google-only accounts need a password linked in prime. first.</p>' +
      (state.error
        ? '<div class="banner error">' + escapeHtml(state.error) + '</div>'
        : '') +
      '<label class="field"><span>Email</span>' +
      '<input id="email" type="email" autocomplete="username" value="' +
      escapeHtml(state.email) +
      '" required /></label>' +
      '<label class="field"><span>Password</span>' +
      '<input id="password" type="password" autocomplete="current-password" value="' +
      escapeHtml(state.password) +
      '" required /></label>' +
      '<button class="btn primary" type="submit"' +
      (state.signingIn ? ' disabled' : '') +
      '>' +
      (state.signingIn ? 'Signing in…' : 'Sign in') +
      '</button>' +
      '</form></div>';
    var form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', onLogin);
    return;
  }

  var items = (state.snapshot && state.snapshot.items ? state.snapshot.items : []).map(
    function (item) {
      return liveItem(item, state.now);
    },
  );
  var selected = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].projectId === state.selectedId) {
      selected = items[i];
      break;
    }
  }
  if (!selected && items.length) selected = items[0];

  if (state.view === 'detail' && selected) {
    app.innerHTML = renderDetail(selected);
    bindChrome();
    return;
  }

  app.innerHTML = renderList(items);
  bindChrome();
}

function renderList(items) {
  var body;
  if (state.loading && !items.length) {
    body = '<div class="empty">Loading pace…</div>';
  } else if (!items.length) {
    body =
      '<div class="empty">No active pace projects.<br/><span class="muted">Set pace in prime. and use the panel menu to refresh.</span></div>';
  } else {
    body =
      '<div class="card-grid' +
      (items.length === 1 ? ' single' : '') +
      '">' +
      items
        .map(function (item) {
          return cardHtml(item, false);
        })
        .join('') +
      '</div>';
  }

  return (
    '<div class="shell">' +
    (state.lastError
      ? '<div class="banner error">' + escapeHtml(state.lastError) + '</div>'
      : '') +
    body +
    '</div>'
  );
}

function cardHtml(item, expanded) {
  var marginClass =
    item.marginSeconds < 0 ? 'pace-card-margin is-behind' : 'pace-card-margin';

  // Use <div> not <button> — UXP flattens button children into one line.
  // Wrap properties in .pace-card-body so the card can vertically center
  // that block without flexing each property line (which overlaps in UXP).
  return (
    '<div class="pace-card tone-' +
    item.tone +
    (expanded ? ' expanded' : '') +
    '" data-action="open" data-id="' +
    escapeHtml(item.projectId) +
    '">' +
    '<div class="pace-card-body">' +
    '<div class="pace-card-name">' +
    escapeHtml(item.projectName) +
    '</div>' +
    '<div class="pace-card-pace is-' +
    item.tone +
    '">' +
    formatHMS(item.paceSeconds) +
    '</div>' +
    '<div class="' +
    marginClass +
    '">' +
    formatHMS(item.marginSeconds) +
    '</div>' +
    '<div class="pace-card-end">' +
    escapeHtml(formatPaceEnd(item.paceEnd)) +
    '</div>' +
    (expanded
      ? '<div class="pace-card-extra">' +
        '<div class="pace-card-extra-line"><span class="muted">Remaining</span><br/>' +
        formatHMS(item.remainingSeconds) +
        '</div>' +
        '<div class="pace-card-extra-line"><span class="muted">Est.</span><br/>' +
        escapeHtml(formatShortDate(item.estimatedCompletion)) +
        '</div>' +
        '</div>'
      : '') +
    '</div></div>'
  );
}

function renderDetail(item) {
  return (
    '<div class="shell">' +
    (state.lastError
      ? '<div class="banner error">' + escapeHtml(state.lastError) + '</div>'
      : '') +
    '<div class="card-grid single">' +
    cardHtml(item, true) +
    '</div></div>'
  );
}

function bindChrome() {
  var nodes = app.querySelectorAll('[data-action]');
  for (var i = 0; i < nodes.length; i++) {
    (function (el) {
      el.addEventListener('click', function () {
        var action = el.getAttribute('data-action');
        if (action === 'open') {
          if (state.view === 'login' || state.view === 'boot') return;
          refreshSnapshot();
        }
      });
    })(nodes[i]);
  }
}

function onLogin(event) {
  event.preventDefault();
  var emailEl = document.getElementById('email');
  var passwordEl = document.getElementById('password');
  var email = emailEl ? emailEl.value : '';
  var password = passwordEl ? passwordEl.value : '';
  state.email = email;
  state.password = password;
  state.signingIn = true;
  state.error = '';
  render();

  client
    .signInWithPassword(email.trim(), password)
    .then(function () {
      state.password = '';
      state.signingIn = false;
      state.view = 'list';
      return refreshSnapshot().then(function () {
        startTimers();
      });
    })
    .catch(function (err) {
      state.error = (err && err.message) || 'Sign-in failed';
      state.signingIn = false;
      render();
    });
}

function onSignOut() {
  stopTimers();
  client.signOut().then(function () {
    state.snapshot = null;
    state.selectedId = null;
    state.view = 'login';
    state.error = '';
    state.lastError = '';
    render();
  });
}

function refreshSnapshot() {
  state.loading = true;
  state.lastError = '';
  // Avoid full re-render flicker on background refresh when cards already exist.
  var hasItems =
    state.snapshot && state.snapshot.items && state.snapshot.items.length > 0;
  if (!hasItems) render();
  return loadPaceSnapshot(client)
    .then(function (snapshot) {
      state.snapshot = snapshot;
      if (state.selectedId) {
        var stillThere = false;
        for (var i = 0; i < snapshot.items.length; i++) {
          if (snapshot.items[i].projectId === state.selectedId) {
            stillThere = true;
            break;
          }
        }
        if (!stillThere) {
          state.selectedId = null;
          state.view = 'list';
        }
      }
    })
    .catch(function (err) {
      state.lastError = (err && err.message) || 'Failed to load pace';
    })
    .then(function () {
      state.loading = false;
      state.now = new Date();
      render();
    });
}

function startTimers() {
  stopTimers();
  tickTimer = setInterval(function () {
    state.now = new Date();
    if (state.view === 'list' || state.view === 'detail') render();
  }, 1000);
  refreshTimer = setInterval(function () {
    refreshSnapshot();
  }, REFRESH_MS);
}

function stopTimers() {
  if (tickTimer) clearInterval(tickTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  tickTimer = null;
  refreshTimer = null;
}

function boot() {
  withTimeout(
    client.ensureSession(),
    BOOT_TIMEOUT_MS,
    'Timed out restoring session. Showing sign-in.',
  )
    .then(function (session) {
      if (!session) {
        state.view = 'login';
        render();
        return;
      }
      state.view = 'list';
      return refreshSnapshot().then(function () {
        startTimers();
      });
    })
    .catch(function (err) {
      state.view = 'login';
      state.error = (err && err.message) || 'Could not restore session';
      render();
    });
}

try {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    showFatal('Missing Supabase credentials in the built panel. Rebuild with .env.local present.');
  } else if (!app) {
    showFatal('Panel root #app was not found.');
  } else {
    app.setAttribute('data-prime-boot', '1');
    setupPanelMenu();
    boot();
  }
} catch (err) {
  showFatal((err && err.message) || 'Panel failed to start');
}
