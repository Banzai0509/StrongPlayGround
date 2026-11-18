/* 강한 놀이터 — Supabase bridge
 * 게임 코드가 쓰는 세 가지(window.claude.use('room' | 'user' | 'db'))를 Supabase로 제공합니다.
 *  - room: Supabase Realtime(broadcast)으로 같은 놀이터의 사람들 위치/동작 공유
 *  - user: 익명 로그인(Anonymous Sign-In)의 고유 id
 *  - db:   records 테이블(기록판·출석)
 * 연결에 실패하면 use()가 null을 돌려주고, 게임은 혼자 노는 모드로 계속 동작합니다. */
(function () {
  'use strict';
  var CFG = {
    url: 'https://mwaswqfrjwfkjmrsgihq.supabase.co',
    key: 'sb_publishable_gavyRVzV49Pph5RJCLHbJA_U_2HoIJb', // publishable key: 브라우저에 공개돼도 되는 키
    channel: 'kp-lobby',
    table: 'records'
  };
  var lib = window.supabase;
  var sb = null;
  try { sb = lib && lib.createClient ? lib.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true }, realtime: { params: { eventsPerSecond: 10 } } }) : null; } catch (e) { sb = null; }
  if (!sb) { window.claude = { use: function () { return Promise.resolve(null); } }; return; }

  /* ---- user: anonymous auth ---- */
  var authP = null;
  function auth() {
    if (authP) return authP;
    authP = (async function () {
      try {
        var s = await sb.auth.getSession();
        if (s && s.data && s.data.session && s.data.session.user) return s.data.session.user.id;
        var r = await sb.auth.signInAnonymously();
        if (r && r.error) { console.warn('[bridge] 익명 로그인 실패 — Supabase > Authentication > Sign In / Providers에서 Anonymous를 켜세요:', r.error.message); return null; }
        return r && r.data && r.data.user ? r.data.user.id : null;
      } catch (e) { console.warn('[bridge] auth', e); return null; }
    })();
    return authP;
  }
  var userApi = { id: function () { return auth(); } };

  /* ---- db: records table ---- */
  function bad(e) { return { code: 'invalid_argument', message: e && e.message ? e.message : 'error' }; }
  function mk(id, row) { return { id: id, exists: !!row, data: function () { return row ? Object.assign({}, row) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  var dbApi = {
    doc: function (path) {
      var id = String(path).split('/')[1];
      return {
        get: async function () {
          var r = await sb.from(CFG.table).select('*').eq('id', id).maybeSingle();
          if (r.error) throw bad(r.error);
          return mk(id, r.data);
        },
        set: async function (d) {
          var uid = await auth();
          if (!uid || uid !== id) throw bad({ message: 'not signed in' });
          var row = Object.assign({}, d, { id: id });
          var r = await sb.from(CFG.table).upsert(row);
          if (r.error) throw bad(r.error);
        }
      };
    },
    collection: function () {
      return {
        onSnapshot: function (next) {
          var dead = false, timer = null, ch = null, deb = null;
          async function load() {
            if (dead) return;
            try {
              var r = await sb.from(CFG.table).select('*').order('t', { ascending: false }).limit(300);
              if (r.error || dead) return;
              next({ docs: (r.data || []).map(function (x) { return mk(x.id, x); }), size: (r.data || []).length });
            } catch (e) { /* 일시적 오류는 다음 주기에 다시 */ }
          }
          load();
          timer = setInterval(load, 30000);
          try {
            ch = sb.channel('kp-records').on('postgres_changes', { event: '*', schema: 'public', table: CFG.table }, function () { clearTimeout(deb); deb = setTimeout(load, 700); }).subscribe();
          } catch (e) { ch = null; }
          return function () { dead = true; clearInterval(timer); clearTimeout(deb); if (ch) { try { sb.removeChannel(ch); } catch (e) {} } };
        }
      };
    }
  };

  /* ---- room: realtime presence over broadcast ---- */
  var roomApi = null;
  function makeRoom() {
    var me = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    var mine = {}, others = new Map(), handlers = [], connected = false, lastJson = '', lastSend = 0, timer = null, notifyT = null;
    var STALE = 8000, MIN_GAP = 150, KEEP = 2000;
    var ch = sb.channel(CFG.channel, { config: { broadcast: { self: false }, presence: { key: me } } });
    function list() {
      var out = [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }];
      others.forEach(function (v, k) { out.push({ peer: k, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.s, updatedAt: v.seen }); });
      return out;
    }
    function notify() {
      if (notifyT) return;
      notifyT = setTimeout(function () { notifyT = null; var p = list(); handlers.forEach(function (h) { try { h({ peers: p, joined: [], left: [], updated: [] }); } catch (e) {} }); }, 60);
    }
    function send(force) {
      if (!connected) return;
      var j = JSON.stringify(mine), now = Date.now();
      if (!force && j === lastJson && now - lastSend < KEEP) return;
      if (now - lastSend < MIN_GAP) { if (!timer) timer = setTimeout(function () { timer = null; send(false); }, MIN_GAP - (now - lastSend) + 5); return; }
      lastJson = j; lastSend = now;
      try { ch.send({ type: 'broadcast', event: 'p', payload: { id: me, s: mine } }); } catch (e) {}
    }
    ch.on('broadcast', { event: 'p' }, function (m) {
      var p = m && m.payload; if (!p || typeof p.id !== 'string' || p.id === me || !p.s || typeof p.s !== 'object') return;
      var fresh = !others.has(p.id);
      others.set(p.id, { s: p.s, seen: Date.now() });
      if (fresh) send(true);   // 새로 들어온 사람에게 내 상태를 바로 알려줌
      notify();
    });
    ch.on('presence', { event: 'leave' }, function (e) { var ks = (e && e.leftPresences) || []; var key = e && e.key; if (key && others.delete(key)) notify(); ks.forEach(function (x) { if (x && x.pid && others.delete(x.pid)) notify(); }); });
    setInterval(function () { var now = Date.now(), ch2 = false; others.forEach(function (v, k) { if (now - v.seen > STALE) { others.delete(k); ch2 = true; } }); if (ch2) notify(); send(false); }, 1000);
    ch.subscribe(function (status) {
      if (status === 'SUBSCRIBED') { connected = true; try { ch.track({ pid: me }); } catch (e) {} send(true); notify(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { connected = false; }
    });
    addEventListener('pagehide', function () { try { ch.untrack(); } catch (e) {} });
    return {
      presence: function (patch) {
        try { for (var k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } } catch (e) { return Promise.reject(e); }
        send(false); notify(); return Promise.resolve();
      },
      onPeers: function (fn) { handlers.push(fn); setTimeout(function () { fn({ peers: list(), joined: [], left: [], updated: [] }); }, 0); return function () { handlers = handlers.filter(function (h) { return h !== fn; }); }; },
      peers: list,
      connected: function () { return connected; },
      emit: function () { return Promise.resolve(); },
      on: function () { return function () {}; }
    };
  }

  window.claude = {
    use: function (name) {
      try {
        if (name === 'user') return Promise.resolve(userApi);
        if (name === 'db') return Promise.resolve(dbApi);
        if (name === 'room') { if (!roomApi) roomApi = makeRoom(); return Promise.resolve(roomApi); }
      } catch (e) { console.warn('[bridge]', e); }
      return Promise.resolve(null);
    }
  };
})();
