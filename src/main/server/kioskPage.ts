/**
 * The customer kiosk web page (served at /kiosk). One self-contained HTML page
 * with plain JavaScript, so it runs in Safari on any iPad with nothing to install.
 *
 * Screens: pairing code → store logo (idle) → sign-up form → thank you → logo.
 */
export const kioskPageHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Kiosk">
<meta name="theme-color" content="#9b0c23">
<title>Welcome</title>
<style>
  :root { --red:#c8102e; --red-dark:#9b0c23; --text:#1c1f26; --muted:#646a75; --border:#c9cdd4; --bg:#f6f7f9; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html, body { margin:0; height:100%; background:#fff; color:var(--text);
    font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overscroll-behavior:none; }
  body { display:flex; flex-direction:column; user-select:none; -webkit-user-select:none; }
  .screen { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px; text-align:center; }
  [hidden] { display:none !important; }
  .bar { height:10px; background:linear-gradient(90deg, var(--red-dark), var(--red)); flex:none; }

  /* Idle */
  #logo { max-width:min(70vw, 640px); max-height:45vh; object-fit:contain; }
  #storeName { font-size:clamp(40px, 7vw, 72px); font-weight:800; color:var(--red-dark); margin:0; letter-spacing:-1px; }
  #welcome { font-size:clamp(20px, 3vw, 30px); color:var(--muted); margin-top:28px; max-width:800px; }

  /* Pairing */
  #pair h1 { font-size:28px; margin:0 0 8px; }
  #code { font-size:clamp(64px, 12vw, 120px); font-weight:800; letter-spacing:8px; color:var(--red-dark); margin:24px 0; font-variant-numeric:tabular-nums; }
  .hint { color:var(--muted); font-size:18px; max-width:620px; line-height:1.5; }

  /* Form */
  #form { justify-content:flex-start; padding-top:5vh; }
  .card { width:min(720px, 100%); text-align:left; }
  .card h1 { font-size:clamp(28px, 4vw, 38px); margin:0 0 6px; }
  .card .sub { color:var(--muted); font-size:18px; margin:0 0 24px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  label { display:block; font-size:16px; font-weight:600; margin-bottom:16px; color:var(--text); }
  input[type=text], input[type=tel], input[type=email] {
    display:block; width:100%; margin-top:6px; font-size:24px; padding:14px 16px; border-radius:12px;
    border:2px solid var(--border); background:#fff; color:var(--text); -webkit-appearance:none; user-select:text; -webkit-user-select:text; }
  input:focus { outline:none; border-color:var(--red); box-shadow:0 0 0 4px #fdecee; }
  .check { display:flex; align-items:center; gap:14px; font-weight:500; font-size:18px; padding:8px 0; }
  .check input { width:30px; height:30px; accent-color:var(--red); flex:none; }
  .privacy { font-size:14px; color:var(--muted); line-height:1.5; margin:8px 0 20px; }
  .error { color:var(--red); font-size:18px; font-weight:600; min-height:26px; margin-bottom:8px; }
  .buttons { display:flex; gap:16px; }
  button { font:inherit; font-size:24px; font-weight:700; padding:18px 28px; border-radius:14px; border:2px solid var(--border); background:#fff; color:var(--text); }
  button.primary { flex:1; background:linear-gradient(var(--red), var(--red-dark)); color:#fff; border-color:var(--red-dark); }
  button:disabled { opacity:.5; }

  /* Thanks */
  #thanks .tick { width:120px; height:120px; border-radius:50%; background:#1a7f37; color:#fff; font-size:72px; line-height:120px; margin-bottom:24px; }
  #thanks h1 { font-size:clamp(36px, 6vw, 56px); margin:0; }
  #thanks p { font-size:22px; color:var(--muted); }

  #offline { position:fixed; left:0; right:0; bottom:0; background:#ffb020; color:#3b2a00; text-align:center; padding:10px; font-size:16px; font-weight:600; }
  #kioskName { position:fixed; right:14px; bottom:10px; font-size:12px; color:#b5b9c0; }
  @media (max-width:600px) { .grid2 { grid-template-columns:1fr; gap:0; } }
</style>
</head>
<body>
<div class="bar"></div>

<section id="pair" class="screen" hidden>
  <h1>Set up this customer kiosk</h1>
  <div class="hint">On a till, open <b>Settings → Customer Kiosk</b>, choose <b>Pair a kiosk</b> and enter this code:</div>
  <div id="code">······</div>
  <div class="hint">The code changes every 10 minutes. Tip: use <b>Guided Access</b> on the iPad (triple-click the side or home button) to lock it to this page.</div>
</section>

<section id="idle" class="screen" hidden>
  <img id="logo" alt="" hidden>
  <h1 id="storeName"></h1>
  <div id="welcome"></div>
</section>

<section id="form" class="screen" hidden>
  <form class="card" id="signup" autocomplete="off" novalidate>
    <h1>Welcome! Tell us about you</h1>
    <p class="sub">Your details will be added to your purchase.</p>
    <div class="grid2">
      <label>First name<input type="text" id="firstName" autocapitalize="words" autocorrect="off" spellcheck="false" maxlength="60"></label>
      <label>Last name<input type="text" id="lastName" autocapitalize="words" autocorrect="off" spellcheck="false" maxlength="60"></label>
    </div>
    <label>Mobile<input type="tel" id="mobile" inputmode="tel" autocorrect="off" maxlength="30"></label>
    <label>Email<input type="email" id="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="100"></label>
    <label class="check"><input type="checkbox" id="okToEmail"> Yes, email me receipts, news and offers</label>
    <div class="privacy" id="privacy"></div>
    <div class="error" id="error"></div>
    <div class="buttons">
      <button type="button" id="cancelBtn">Cancel</button>
      <button type="submit" class="primary" id="submitBtn">Submit</button>
    </div>
  </form>
</section>

<section id="thanks" class="screen" hidden>
  <div class="tick">✓</div>
  <h1 id="thanksTitle">Thank you!</h1>
  <p>You're all set. Please let the staff member know.</p>
</section>

<div id="offline" hidden>Reconnecting to the store system…</div>
<div id="kioskName"></div>

<script>
(function () {
  var TOKEN_KEY = 'diamondpos_kiosk_token';
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  var es = null, sessionId = null, storeName = 'our store', thanksTimer = null, busy = false;
  var $ = function (id) { return document.getElementById(id); };

  function show(id) {
    ['pair', 'idle', 'form', 'thanks'].forEach(function (s) { $(s).hidden = s !== id; });
    if (id !== 'form' && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function forgetToken() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    if (es) { es.close(); es = null; }
  }

  // ---------- Pairing ----------
  function startPairing() {
    show('pair');
    $('kioskName').textContent = '';
    api('POST', '/kiosk/api/pair-request').then(function (j) {
      $('code').textContent = j.code.slice(0, 3) + ' ' + j.code.slice(3);
      pollPairing(j.code);
    }).catch(function () { setTimeout(startPairing, 5000); });
  }
  function pollPairing(code) {
    setTimeout(function () {
      api('GET', '/kiosk/api/pair-status/' + code).then(function (j) {
        if (j.paired) {
          token = j.token;
          try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
          start();
        } else if (j.expired) startPairing();
        else pollPairing(code);
      }).catch(function () { pollPairing(code); });
    }, 2000);
  }

  // ---------- Branding + live connection ----------
  function loadInfo() {
    return api('GET', '/kiosk/api/info?token=' + encodeURIComponent(token)).then(function (j) {
      storeName = j.storeName || storeName;
      document.title = storeName;
      $('storeName').textContent = storeName;
      $('welcome').textContent = j.welcome || '';
      $('kioskName').textContent = j.kioskName || '';
      $('privacy').textContent = 'Your details are kept by ' + storeName +
        ' to record your purchases and contact you about them. We only send marketing emails if you tick the box. You can ask us to see or correct your details at any time.';
      var logo = $('logo');
      if (j.hasLogo) { logo.src = '/kiosk/logo?v=' + Date.now(); logo.hidden = false; $('storeName').hidden = true; }
      else { logo.hidden = true; $('storeName').hidden = false; }
    });
  }

  function connect() {
    if (es) es.close();
    es = new EventSource('/kiosk/api/events?token=' + encodeURIComponent(token));
    es.onopen = function () { $('offline').hidden = true; };
    es.onmessage = function (e) { try { handle(JSON.parse(e.data)); } catch (x) {} };
    es.onerror = function () {
      $('offline').hidden = false;
      // The browser retries by itself; if the server refused us (e.g. unpaired) start over
      if (es && es.readyState === 2) setTimeout(start, 5000);
    };
  }

  function handle(ev) {
    if (ev.type === 'form') openForm(ev.sessionId);
    else if (ev.type === 'idle') { sessionId = null; show('idle'); }
    else if (ev.type === 'thanks') showThanks(ev.firstName);
    else if (ev.type === 'branding') loadInfo();
    else if (ev.type === 'unpaired') { forgetToken(); startPairing(); }
  }

  function start() {
    if (!token) return startPairing();
    loadInfo().then(function () {
      if (!$('thanks').hidden || !$('form').hidden) return connect();
      show('idle');
      connect();
    }).catch(function (e) {
      if (e.status === 401) { forgetToken(); startPairing(); }
      else { $('offline').hidden = false; setTimeout(start, 5000); }
    });
  }

  // ---------- Sign-up form ----------
  function openForm(id) {
    if (sessionId === id && !$('form').hidden) return;
    sessionId = id;
    clearTimeout(thanksTimer);
    ['firstName', 'lastName', 'mobile', 'email'].forEach(function (f) { $(f).value = ''; });
    $('okToEmail').checked = false;
    $('error').textContent = '';
    busy = false;
    $('submitBtn').disabled = false;
    show('form');
  }

  function showThanks(firstName) {
    sessionId = null;
    $('thanksTitle').textContent = firstName ? 'Thank you, ' + firstName + '!' : 'Thank you!';
    show('thanks');
    clearTimeout(thanksTimer);
    thanksTimer = setTimeout(function () { show('idle'); }, 5000);
  }

  $('signup').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !sessionId) return;
    var data = {
      token: token,
      sessionId: sessionId,
      firstName: $('firstName').value.trim(),
      lastName: $('lastName').value.trim(),
      mobile: $('mobile').value.trim(),
      email: $('email').value.trim(),
      okToEmail: $('okToEmail').checked
    };
    if (!data.firstName || !data.lastName) { $('error').textContent = 'Please enter your first and last name.'; return; }
    if (!data.mobile && !data.email) { $('error').textContent = 'Please enter a mobile number or an email address.'; return; }
    if (data.email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(data.email)) { $('error').textContent = 'Please check your email address.'; return; }
    busy = true;
    $('submitBtn').disabled = true;
    $('error').textContent = '';
    api('POST', '/kiosk/api/submit', data).then(function (j) {
      showThanks(j.firstName);
    }).catch(function (err) {
      busy = false;
      $('submitBtn').disabled = false;
      $('error').textContent = err.message;
    });
  });

  $('cancelBtn').addEventListener('click', function () {
    var id = sessionId;
    sessionId = null;
    show('idle');
    if (id) api('POST', '/kiosk/api/cancel', { token: token, sessionId: id }).catch(function () {});
  });

  // Stop pinch-zoom / double-tap zoom on iPad
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouch < 350 && e.target.tagName !== 'INPUT') e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  start();
})();
</script>
</body>
</html>`
