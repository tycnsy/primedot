const SESSION_KEY = 'prime.premiere.pace.session.v1';
const REQUEST_TIMEOUT_MS = 12000;

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // ignore quota / UXP storage failures
  }
}

function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    // ignore
  }
}

/**
 * UXP is more reliable with XHR than fetch for some hosts.
 * Mirrors Adobe's oauth-workflow-sample pattern.
 */
function xhrJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise(function (resolve, reject) {
    var req = new XMLHttpRequest();
    req.timeout = REQUEST_TIMEOUT_MS;
    req.onload = function () {
      var text = req.responseText || '';
      var json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch (err) {
          json = { message: text };
        }
      }
      if (req.status >= 200 && req.status < 300) {
        resolve(json);
        return;
      }
      var msg =
        (json && (json.error_description || json.msg || json.message || json.error || json.hint)) ||
        'Request failed (' + req.status + ')';
      reject(new Error(String(msg)));
    };
    req.ontimeout = function () {
      reject(new Error('Request timed out. Check network permissions for Supabase.'));
    };
    req.onerror = function () {
      reject(new Error('Network error talking to Supabase.'));
    };
    req.open(method, url, true);
    var headerKeys = Object.keys(headers);
    for (var i = 0; i < headerKeys.length; i++) {
      req.setRequestHeader(headerKeys[i], headers[headerKeys[i]]);
    }
    req.send(body == null ? null : body);
  });
}

function buildQuery(filters) {
  var parts = [];
  var keys = Object.keys(filters || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = filters[key];
    if (value == null || value === '') continue;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return parts.join('&');
}

export function createSupabaseClient(url, anonKey) {
  var base = String(url || '').replace(/\/$/, '');
  var session = null;

  function loadSession() {
    var raw = storageGet(SESSION_KEY);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function persistSession(next) {
    session = next;
    if (!next) {
      storageRemove(SESSION_KEY);
      return;
    }
    storageSet(SESSION_KEY, JSON.stringify(next));
  }

  session = loadSession();

  function authFetch(path, options) {
    options = options || {};
    var method = options.method || 'GET';
    var body = options.body;
    var headers = options.headers || {};
    var merged = {
      apikey: anonKey,
      'Content-Type': 'application/json',
    };
    var headerKeys = Object.keys(headers);
    for (var i = 0; i < headerKeys.length; i++) {
      merged[headerKeys[i]] = headers[headerKeys[i]];
    }
    return xhrJson(base + '/auth/v1' + path, {
      method: method,
      headers: merged,
      body: body ? JSON.stringify(body) : null,
    });
  }

  function normalizeSession(json) {
    if (!json || !json.access_token) return null;
    var expiresIn = Number(json.expires_in) || 3600;
    var expiresAt =
      json.expires_at != null
        ? json.expires_at
        : Math.floor(Date.now() / 1000) + expiresIn;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: expiresAt,
      user: json.user || (session && session.user) || null,
    };
  }

  function refreshIfNeeded() {
    if (!session || !session.refresh_token) {
      return Promise.resolve(null);
    }
    var expiresAt = session.expires_at || 0;
    var nowSec = Math.floor(Date.now() / 1000);
    // Refresh 60s before expiry
    if (expiresAt && expiresAt - nowSec > 60) {
      return Promise.resolve(session);
    }

    return authFetch('/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    }).then(function (json) {
      var next = normalizeSession(json);
      persistSession(next);
      return next;
    });
  }

  function rest(path, options) {
    options = options || {};
    var method = options.method || 'GET';
    var query = options.query || '';
    var headers = options.headers || {};

    return refreshIfNeeded().then(function () {
      if (!session || !session.access_token) {
        throw new Error('Not signed in');
      }
      var qs = query ? (query.charAt(0) === '?' ? query : '?' + query) : '';
      var merged = {
        apikey: anonKey,
        Authorization: 'Bearer ' + session.access_token,
        Accept: 'application/json',
        Prefer: 'return=representation',
      };
      var headerKeys = Object.keys(headers);
      for (var i = 0; i < headerKeys.length; i++) {
        merged[headerKeys[i]] = headers[headerKeys[i]];
      }
      return xhrJson(base + '/rest/v1' + path + qs, {
        method: method,
        headers: merged,
      });
    });
  }

  return {
    getSession: function () {
      return session;
    },
    getUser: function () {
      return (session && session.user) || null;
    },
    signInWithPassword: function (email, password) {
      return authFetch('/token?grant_type=password', {
        method: 'POST',
        body: { email: email, password: password },
      }).then(function (json) {
        var next = normalizeSession(json);
        persistSession(next);
        return next;
      });
    },
    signOut: function () {
      var logout = Promise.resolve();
      if (session && session.access_token) {
        logout = authFetch('/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + session.access_token },
        }).catch(function () {
          // still clear local session
        });
      }
      return logout.then(function () {
        persistSession(null);
      });
    },
    ensureSession: function () {
      if (!session) return Promise.resolve(null);
      return refreshIfNeeded().catch(function () {
        persistSession(null);
        return null;
      });
    },
    from: function (table) {
      return {
        select: function (columns, filters) {
          columns = columns || '*';
          filters = filters || {};
          var params = Object.assign({ select: columns }, filters);
          return rest('/' + table, { query: buildQuery(params) });
        },
      };
    },
  };
}
