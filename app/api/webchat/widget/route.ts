import { NextRequest, NextResponse } from 'next/server';

// GET /api/webchat/widget — embeddowalny skrypt czatu (Faza 2).
// Wpięcie na stronie klienta (deploy robi OPERATOR — klient nic nie konfiguruje):
//   <script src="https://crm.stronevo.pl/api/webchat/widget"
//           data-owner="<uuid firmy>" data-name="Nazwa firmy" defer></script>
// Widget: dymek + panel w brandzie (kolory nadpisywalne data-color), wysyła do
// /api/webchat/message, nowe odpowiedzi przez polling /api/webchat/poll.
// Self-contained vanilla JS — zero zależności, działa na każdym CMS.

export const dynamic = 'force-static';

export async function GET(_request: NextRequest) {
  return new NextResponse(WIDGET_JS, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

const WIDGET_JS = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var base = new URL(script.src).origin;
  var owner = script.getAttribute('data-owner') || '';
  var name = script.getAttribute('data-name') || 'Czat';
  var color = script.getAttribute('data-color') || '#9b2242';
  var gold = '#d8b677';

  var LS_KEY = 'stronevo_chat_' + (owner || 'own');
  var state = { sid: null, conv: null, open: false, lastAt: null, timer: null };
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    state.sid = saved.sid || null;
    state.conv = saved.conv || null;
  } catch (e) {}
  if (!state.sid) {
    state.sid = 'wc-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    persist();
  }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ sid: state.sid, conv: state.conv })); } catch (e) {}
  }

  // ===== UI =====
  var css = document.createElement('style');
  css.textContent =
    '.svo-chat-btn{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:' + color + ';color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:99998;transition:transform .15s}' +
    '.svo-chat-btn:hover{transform:scale(1.06)}' +
    '.svo-chat-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:70vh;background:#141011;border:1px solid #372a2d;border-radius:14px;display:none;flex-direction:column;overflow:hidden;z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif}' +
    '.svo-chat-panel.open{display:flex}' +
    '.svo-chat-head{padding:12px 16px;background:linear-gradient(135deg,' + color + ',#5e2230);color:#fff}' +
    '.svo-chat-head b{font-size:15px}.svo-chat-head span{display:block;font-size:11px;opacity:.85}' +
    '.svo-chat-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '.svo-msg{max-width:82%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;color:#e7e5e4}' +
    '.svo-msg.in{align-self:flex-end;background:' + color + ';border-bottom-right-radius:4px}' +
    '.svo-msg.out{align-self:flex-start;background:#241a1c;border:1px solid #372a2d;border-bottom-left-radius:4px}' +
    '.svo-msg.out.ai:after{content:"odpowiedź automatyczna";display:block;font-size:9px;color:#8a8a8a;margin-top:4px}' +
    '.svo-chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid #372a2d;background:#1a1315}' +
    '.svo-chat-form input{flex:1;background:#241a1c;border:1px solid #372a2d;border-radius:8px;padding:9px 12px;color:#e7e5e4;font-size:13px;outline:none}' +
    '.svo-chat-form input:focus{border-color:' + gold + '}' +
    '.svo-chat-form button{background:' + color + ';color:#fff;border:none;border-radius:8px;padding:0 16px;font-size:13px;font-weight:600;cursor:pointer}' +
    '.svo-chat-brand{padding:5px;text-align:center;font-size:9px;color:#78716c;background:#1a1315}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.className = 'svo-chat-btn';
  btn.innerHTML = '💬';
  btn.setAttribute('aria-label', 'Otwórz czat');

  var panel = document.createElement('div');
  panel.className = 'svo-chat-panel';
  panel.innerHTML =
    '<div class="svo-chat-head"><b>' + esc(name) + '</b><span>Zwykle odpowiadamy w kilka sekund</span></div>' +
    '<div class="svo-chat-msgs"></div>' +
    '<form class="svo-chat-form"><input type="text" placeholder="Napisz wiadomość..." maxlength="1000" /><button type="submit">Wyślij</button></form>' +
    '<div class="svo-chat-brand">obsługa: STRONEVO</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var msgs = panel.querySelector('.svo-chat-msgs');
  var form = panel.querySelector('form');
  var input = panel.querySelector('input');

  btn.addEventListener('click', function () {
    state.open = !state.open;
    panel.classList.toggle('open', state.open);
    if (state.open) {
      input.focus();
      if (msgs.children.length === 0) {
        addMsg('out', 'Dzień dobry! W czym możemy pomóc?', 'ai');
      }
      startPoll();
    } else {
      stopPoll();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('in', text);
    fetch(base + '/api/webchat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: owner || null, session_id: state.sid, body: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.conversation_id) { state.conv = j.conversation_id; persist(); }
        (j.replies || []).forEach(function (m) {
          addMsg('out', m.body, m.author);
          if (m.created_at) state.lastAt = m.created_at;
        });
      })
      .catch(function () { addMsg('out', 'Nie udało się wysłać — spróbuj ponownie.', 'ai'); });
  });

  function addMsg(dir, text, author) {
    var d = document.createElement('div');
    d.className = 'svo-msg ' + dir + (author === 'ai' ? ' ai' : '');
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function startPoll() {
    stopPoll();
    state.timer = setInterval(function () {
      if (!state.conv) return;
      var url = base + '/api/webchat/poll?conversation=' + encodeURIComponent(state.conv) +
        '&session=' + encodeURIComponent(state.sid) +
        (state.lastAt ? '&after=' + encodeURIComponent(state.lastAt) : '');
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          (j.messages || []).forEach(function (m) {
            addMsg('out', m.body, m.author);
            state.lastAt = m.created_at;
          });
        })
        .catch(function () {});
    }, 4000);
  }
  function stopPoll() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();`;
