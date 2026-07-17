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
const MAX_CARD_COLS = 5;
const CARD_GAP_PX = 8;
const CARD_PAD_X_PX = 24; // 12px padding each side
const CARD_BORDER_X_PX = 2; // 1px border each side
const PACE_MIN_WIDTH_FACTOR = 1.5;
const LAYOUT_RESIZE_DEBOUNCE_MS = 80;

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
let resizeTimer = null;
let paceProbeEl = null;
let cachedPaceNumberWidth = 0;

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

function getLiveItems() {
  return (state.snapshot && state.snapshot.items ? state.snapshot.items : []).map(
    function (item) {
      return liveItem(item, state.now);
    },
  );
}

function getSelectedItem(items) {
  var selected = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].projectId === state.selectedId) {
      selected = items[i];
      break;
    }
  }
  if (!selected && items.length) selected = items[0];
  return selected;
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

  var items = getLiveItems();
  var selected = getSelectedItem(items);

  if (state.view === 'detail' && selected) {
    app.innerHTML = renderDetail(selected);
    bindChrome();
    return;
  }

  app.innerHTML = renderList(items);
  bindChrome();
  layoutCardGrid();
}

/** Update timers in place — avoids destroying the card grid every second. */
function updateLiveDom() {
  if (!app) return;
  if (state.view !== 'list' && state.view !== 'detail') return;

  var items = getLiveItems();
  var cards = app.querySelectorAll('.pace-card[data-id]');
  if (!cards.length) {
    render();
    return;
  }

  var byId = {};
  for (var i = 0; i < items.length; i++) {
    byId[items[i].projectId] = items[i];
  }

  // Project set changed — full rebuild.
  if (cards.length !== items.length) {
    render();
    return;
  }

  for (var c = 0; c < cards.length; c++) {
    var card = cards[c];
    var id = card.getAttribute('data-id');
    var item = byId[id];
    if (!item) {
      render();
      return;
    }

    var tone = item.tone;
    card.className =
      'pace-card tone-' + tone + (card.className.indexOf('expanded') >= 0 ? ' expanded' : '');

    var paceEl = card.querySelector('.pace-card-pace');
    if (paceEl) {
      paceEl.className = 'pace-card-pace is-' + tone;
      paceEl.textContent = formatHMS(item.paceSeconds);
    }

    var marginEl = card.querySelector('.pace-card-margin');
    if (marginEl) {
      marginEl.className =
        item.marginSeconds < 0 ? 'pace-card-margin is-behind' : 'pace-card-margin';
      marginEl.textContent = formatHMS(item.marginSeconds);
    }

    var endEl = card.querySelector('.pace-card-end');
    if (endEl) {
      endEl.textContent = formatPaceEnd(item.paceEnd);
    }

    var extraLines = card.querySelectorAll('.pace-card-extra-line');
    if (extraLines.length >= 2) {
      // Structure: muted label + <br/> + value — replace whole line text carefully.
      extraLines[0].innerHTML =
        '<span class="muted">Remaining</span><br/>' + formatHMS(item.remainingSeconds);
      extraLines[1].innerHTML =
        '<span class="muted">Est.</span><br/>' +
        escapeHtml(formatShortDate(item.estimatedCompletion));
    }
  }
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

function ensurePaceProbe() {
  if (paceProbeEl && paceProbeEl.parentNode) return paceProbeEl;
  paceProbeEl = document.createElement('div');
  paceProbeEl.className = 'pace-card-pace pace-number-probe';
  paceProbeEl.setAttribute('aria-hidden', 'true');
  paceProbeEl.textContent = '00:00:00';
  // Inline styles beat inherited width:100% from .pace-card-pace in UXP.
  paceProbeEl.style.width = 'auto';
  paceProbeEl.style.display = 'inline-block';
  paceProbeEl.style.whiteSpace = 'nowrap';
  paceProbeEl.style.position = 'absolute';
  paceProbeEl.style.left = '-9999px';
  paceProbeEl.style.visibility = 'hidden';
  document.body.appendChild(paceProbeEl);
  return paceProbeEl;
}

function getPaceNumberWidth() {
  var probe = ensurePaceProbe();
  var width = Math.max(probe.offsetWidth || 0, probe.scrollWidth || 0);
  // Guard against UXP measuring the probe as full panel width (width:100% leak).
  if (width > 40 && width < 200) cachedPaceNumberWidth = width;
  // Fallback ~ "00:00:00" at 22px bold if probe fails in UXP.
  return cachedPaceNumberWidth || 110;
}

function getMinCardWidth() {
  return Math.ceil(getPaceNumberWidth() * PACE_MIN_WIDTH_FACTOR) + CARD_PAD_X_PX + CARD_BORDER_X_PX;
}

function collectPaceCards(grid) {
  var cards = [];
  var children = grid.childNodes;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (!child || child.nodeType !== 1) continue;
    if (child.classList && child.classList.contains('pace-card')) {
      cards.push(child);
      continue;
    }
    if (child.classList && child.classList.contains('card-row')) {
      var rowKids = child.childNodes;
      for (var j = 0; j < rowKids.length; j++) {
        var card = rowKids[j];
        if (card && card.nodeType === 1 && card.classList && card.classList.contains('pace-card')) {
          cards.push(card);
        }
      }
    }
  }
  return cards;
}

function layoutCardGrid() {
  if (!app) return;
  var grid = app.querySelector('.card-grid');
  if (!grid || (grid.classList && grid.classList.contains('single'))) return;

  var cards = collectPaceCards(grid);
  if (!cards.length) return;

  var panelWidth = grid.clientWidth || 0;
  if (panelWidth <= 0) return;

  var minCardWidth = getMinCardWidth();
  // Account for gaps: n cards need (n-1) gaps → floor((W + gap) / (min + gap))
  var cols = Math.min(
    MAX_CARD_COLS,
    cards.length,
    Math.max(1, Math.floor((panelWidth + CARD_GAP_PX) / (minCardWidth + CARD_GAP_PX))),
  );

  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  for (var start = 0; start < cards.length; start += cols) {
    var rowCards = cards.slice(start, start + cols);
    var row = document.createElement('div');
    row.className = 'card-row';
    var count = rowCards.length;

    for (var i = 0; i < count; i++) {
      var card = rowCards[i];
      // Equal flex share fills the row; avoids calc()/pixel↔scrollbar thrash in UXP.
      card.style.width = 'auto';
      card.style.flex = '1 1 0';
      card.style.minWidth = '0';
      card.style.height = 'auto';
      card.style.marginRight = i < count - 1 ? CARD_GAP_PX + 'px' : '0';
      card.style.marginBottom = '0';
      row.appendChild(card);
    }
    grid.appendChild(row);
  }
}

function scheduleLayoutCardGrid() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    resizeTimer = null;
    layoutCardGrid();
  }, LAYOUT_RESIZE_DEBOUNCE_MS);
}

function setupResizeListener() {
  window.addEventListener('resize', scheduleLayoutCardGrid);
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
      var grid = app && app.querySelector('.card-grid');
      var existingCards = grid ? grid.querySelectorAll('.pace-card[data-id]') : [];
      var items = state.snapshot && state.snapshot.items ? state.snapshot.items : [];
      var hasBanner = !!(app && app.querySelector('.banner.error'));
      var errorMismatch = !!state.lastError !== hasBanner;
      var canPatch =
        (state.view === 'list' || state.view === 'detail') &&
        existingCards.length > 0 &&
        existingCards.length === items.length &&
        !errorMismatch;
      if (canPatch) {
        updateLiveDom();
      } else {
        render();
      }
    });
}

function startTimers() {
  stopTimers();
  tickTimer = setInterval(function () {
    state.now = new Date();
    if (state.view === 'list' || state.view === 'detail') updateLiveDom();
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
    setupResizeListener();
    boot();
  }
} catch (err) {
  showFatal((err && err.message) || 'Panel failed to start');
}
