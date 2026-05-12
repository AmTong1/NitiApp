/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const autocannon = require('autocannon');
const { io } = require('socket.io-client');

const BASE_URL = process.env.LOAD_BASE_URL || 'http://127.0.0.1:4000';
const TEST_USER = process.env.LOAD_USER || 'loadtest_bot';
const TEST_PASS = process.env.LOAD_PASS || 'LoadTest#2026';
const LEVELS = (process.env.LOAD_LEVELS || '100,300,500')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);
const HTTP_DURATION_SEC = Number(process.env.LOAD_HTTP_DURATION || 20);
const ENABLE_MIXED_SCENARIO = String(process.env.LOAD_ENABLE_MIXED || 'true').toLowerCase() !== 'false';
const MIXED_USERS = Number(process.env.LOAD_MIXED_USERS || 40);
const MIXED_DURATION_SEC = Number(process.env.LOAD_MIXED_DURATION || 25);
const MIXED_USER_PREFIX = process.env.LOAD_MIXED_USER_PREFIX || 'loadmix_bot';
const MIXED_USER_PASS = process.env.LOAD_MIXED_PASS || TEST_PASS;
const MIXED_PAUSE_MIN_MS = Number(process.env.LOAD_MIXED_PAUSE_MIN || 250);
const MIXED_PAUSE_MAX_MS = Number(process.env.LOAD_MIXED_PAUSE_MAX || 600);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function toPositiveInt(input, fallback) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  const value = Math.trunc(n);
  return value > 0 ? value : fallback;
}

function latencySummary(latencies) {
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    avg: latencies.length
      ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
      : 0,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

async function ensureLogin() {
  await httpJson(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
  });

  const login = await httpJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
  });

  if (!login.ok || !login.body?.token) {
    throw new Error(`login failed: status=${login.status} body=${JSON.stringify(login.body)}`);
  }
  return login.body.token;
}

async function ensurePublicRoom(token) {
  const room = await httpJson(`${BASE_URL}/chat/public-room`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!room.ok || !room.body?.data?.id) {
    throw new Error(`public room failed: status=${room.status} body=${JSON.stringify(room.body)}`);
  }
  return Number(room.body.data.id);
}

async function ensureMixedUserToken(index) {
  const username = `${MIXED_USER_PREFIX}_${String(index + 1).padStart(3, '0')}`;
  await httpJson(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: MIXED_USER_PASS }),
  });

  const login = await httpJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: MIXED_USER_PASS }),
  });

  if (!login.ok || !login.body?.token) {
    throw new Error(`mixed user login failed (${username}): status=${login.status}`);
  }

  return {
    username,
    token: login.body.token,
  };
}

async function ensureMixedUserTokens(count) {
  const normalized = toPositiveInt(count, 0);
  const users = [];

  for (let i = 0; i < normalized; i += 1) {
    const account = await ensureMixedUserToken(i);
    users.push(account);

    if ((i + 1) % 10 === 0 || i + 1 === normalized) {
      console.log(`[MIXED] Prepared users: ${i + 1}/${normalized}`);
    }
  }

  return users;
}

function runAutocannon(options) {
  return new Promise((resolve, reject) => {
    autocannon(options, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });
}

async function runHttpScenario({ connections, token, roomId }) {
  const result = await runAutocannon({
    url: `${BASE_URL}/chat/messages?room_id=${roomId}&limit=30`,
    method: 'GET',
    duration: HTTP_DURATION_SEC,
    connections,
    pipelining: 1,
    timeout: 10,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  return {
    users: connections,
    qps: Number(result.requests?.average || 0),
    latencyMs: {
      p50: Number(result.latency?.p50 || 0),
      p95: Number(result.latency?.p97_5 || 0),
      p99: Number(result.latency?.p99 || 0),
      avg: Number(result.latency?.average || 0),
    },
    errors: {
      non2xx: Number(result.non2xx || 0),
      timeouts: Number(result.timeouts || 0),
      errors: Number(result.errors || 0),
    },
    reqTotal: Number(result.requests?.total || 0),
    bytesTotal: Number(result.throughput?.total || 0),
  };
}

function pickMixedAction(canUpload) {
  const roll = Math.random();
  if (roll < 0.55) return 'fetchMessages';
  if (roll < 0.8) return 'markRead';
  if (roll < 0.95) return 'sendMessage';
  return canUpload ? 'uploadFile' : 'sendMessage';
}

async function runHttpMixedScenario({ users, roomId, durationSec }) {
  const duration = toPositiveInt(durationSec, MIXED_DURATION_SEC);
  const workerCount = Array.isArray(users) ? users.length : 0;
  if (!workerCount) throw new Error('mixed scenario requires at least one user');

  const canUpload = typeof FormData !== 'undefined' && typeof Blob !== 'undefined';
  const startAt = Date.now();
  const endAt = startAt + duration * 1000;
  const allLatencies = [];
  let totalRequests = 0;
  let non2xx = 0;
  let errors = 0;

  const byAction = {
    fetchMessages: { requests: 0, non2xx: 0, errors: 0, latencies: [] },
    markRead: { requests: 0, non2xx: 0, errors: 0, latencies: [] },
    sendMessage: { requests: 0, non2xx: 0, errors: 0, latencies: [] },
    uploadFile: { requests: 0, non2xx: 0, errors: 0, latencies: [] },
  };

  const pauseMin = Math.min(toPositiveInt(MIXED_PAUSE_MIN_MS, 250), toPositiveInt(MIXED_PAUSE_MAX_MS, 600));
  const pauseMax = Math.max(toPositiveInt(MIXED_PAUSE_MIN_MS, 250), toPositiveInt(MIXED_PAUSE_MAX_MS, 600));

  const worker = async (workerIndex, authToken) => {
    while (Date.now() < endAt) {
      let action = pickMixedAction(canUpload);
      const startedAt = Date.now();

      try {
        let res;
        if (action === 'fetchMessages') {
          res = await fetch(`${BASE_URL}/chat/messages?room_id=${roomId}&limit=30`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${authToken}`,
              Accept: 'application/json',
            },
          });
        } else if (action === 'markRead') {
          res = await fetch(`${BASE_URL}/chat/rooms/${roomId}/read`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToken}`,
              Accept: 'application/json',
            },
          });
        } else if (action === 'sendMessage') {
          res = await fetch(`${BASE_URL}/chat/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              room_id: roomId,
              text: `mixed message ${workerIndex + 1} ${Date.now()}`,
            }),
          });
        } else {
          if (!canUpload) {
            action = 'sendMessage';
            res = await fetch(`${BASE_URL}/chat/messages`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                room_id: roomId,
                text: `mixed message fallback ${workerIndex + 1} ${Date.now()}`,
              }),
            });
          } else {
            const form = new FormData();
            form.append('room_id', String(roomId));
            const fileBody = new Blob([`mixed upload ${workerIndex + 1} ${Date.now()}`], {
              type: 'text/plain',
            });
            form.append('file', fileBody, `mixed_${workerIndex + 1}_${Date.now()}.txt`);

            res = await fetch(`${BASE_URL}/chat/upload`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
              body: form,
            });
          }
        }

        const elapsed = Date.now() - startedAt;
        totalRequests += 1;
        allLatencies.push(elapsed);
        byAction[action].requests += 1;
        byAction[action].latencies.push(elapsed);

        if (!res.ok) {
          non2xx += 1;
          byAction[action].non2xx += 1;
        }
      } catch {
        const elapsed = Date.now() - startedAt;
        totalRequests += 1;
        errors += 1;
        allLatencies.push(elapsed);
        byAction[action].requests += 1;
        byAction[action].errors += 1;
        byAction[action].latencies.push(elapsed);
      }

      const pauseMs = pauseMin + Math.floor(Math.random() * (pauseMax - pauseMin + 1));
      await sleep(pauseMs);
    }
  };

  await Promise.all(users.map((user, idx) => worker(idx, user.token)));

  const elapsedSec = Math.max(0.001, (Date.now() - startAt) / 1000);
  const byActionSummary = {};
  for (const key of Object.keys(byAction)) {
    const item = byAction[key];
    byActionSummary[key] = {
      requests: item.requests,
      qps: Number((item.requests / elapsedSec).toFixed(2)),
      non2xx: item.non2xx,
      errors: item.errors,
      latencyMs: latencySummary(item.latencies),
    };
  }

  return {
    users: workerCount,
    durationSec: Number(elapsedSec.toFixed(2)),
    canUpload,
    qps: Number((totalRequests / elapsedSec).toFixed(2)),
    latencyMs: latencySummary(allLatencies),
    errors: {
      non2xx,
      errors,
    },
    totalRequests,
    byAction: byActionSummary,
  };
}

async function runSocketScenario({ clients, token, roomId }) {
  const startedAt = Date.now();
  const sockets = [];
  const latencies = [];
  let success = 0;
  let failed = 0;

  const connectOne = (i) =>
    new Promise((resolve) => {
      const begin = Date.now();
      let settled = false;

      const socket = io(BASE_URL, {
        transports: ['websocket'],
        extraHeaders: { Authorization: `Bearer ${token}` },
        auth: { token: `Bearer ${token}` },
        reconnection: false,
        timeout: 8000,
        forceNew: true,
      });
      sockets.push(socket);

      const settle = (ok) => {
        if (settled) return;
        settled = true;
        if (ok) {
          success += 1;
          latencies.push(Date.now() - begin);
        } else {
          failed += 1;
        }
        resolve();
      };

      const fallbackJoinTimer = setTimeout(() => {
        settle(true);
      }, 2500);

      const hardTimeout = setTimeout(() => {
        clearTimeout(fallbackJoinTimer);
        settle(false);
      }, 10000);

      socket.on('connect', () => {
        socket.emit('join_room', { room_id: roomId, seq: i });
      });

      socket.on('room_joined', () => {
        clearTimeout(fallbackJoinTimer);
        clearTimeout(hardTimeout);
        settle(true);
      });

      socket.on('room_error', () => {
        clearTimeout(fallbackJoinTimer);
        clearTimeout(hardTimeout);
        settle(false);
      });

      socket.on('connect_error', () => {
        clearTimeout(fallbackJoinTimer);
        clearTimeout(hardTimeout);
        settle(false);
      });
    });

  await Promise.all(Array.from({ length: clients }, (_, i) => connectOne(i)));

  const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
  for (const s of sockets) {
    try {
      s.disconnect();
    } catch {
      // ignore
    }
  }

  return {
    users: clients,
    joinQps: Number((success / elapsedSec).toFixed(2)),
    connectLatencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      avg: latencies.length
        ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
        : 0,
    },
    success,
    failed,
    errorRatePct: Number((((failed / Math.max(1, clients)) * 100)).toFixed(2)),
  };
}

function printTable(httpRows, socketRows, mixedResult) {
  console.log('\n=== HTTP /chat/messages load ===');
  console.log('users\tqps\tp50\tp95\tp99\terrors\tnon2xx\ttimeouts');
  for (const r of httpRows) {
    console.log(
      `${r.users}\t${r.qps.toFixed(2)}\t${r.latencyMs.p50.toFixed(2)}\t${r.latencyMs.p95.toFixed(2)}\t${r.latencyMs.p99.toFixed(2)}\t${r.errors.errors}\t${r.errors.non2xx}\t${r.errors.timeouts}`
    );
  }

  console.log('\n=== Socket connect/join load ===');
  console.log('users\tjoinQps\tp50\tp95\tp99\tsuccess\tfailed\terrorRate%');
  for (const r of socketRows) {
    console.log(
      `${r.users}\t${r.joinQps.toFixed(2)}\t${r.connectLatencyMs.p50.toFixed(2)}\t${r.connectLatencyMs.p95.toFixed(2)}\t${r.connectLatencyMs.p99.toFixed(2)}\t${r.success}\t${r.failed}\t${r.errorRatePct.toFixed(2)}`
    );
  }

  if (mixedResult) {
    console.log('\n=== HTTP mixed chat load (messages/read/send/upload) ===');
    console.log('users\tduration(s)\tqps\tp50\tp95\tp99\tnon2xx\terrors\ttotalReq');
    console.log(
      `${mixedResult.users}\t${mixedResult.durationSec.toFixed(2)}\t${mixedResult.qps.toFixed(2)}\t${mixedResult.latencyMs.p50.toFixed(2)}\t${mixedResult.latencyMs.p95.toFixed(2)}\t${mixedResult.latencyMs.p99.toFixed(2)}\t${mixedResult.errors.non2xx}\t${mixedResult.errors.errors}\t${mixedResult.totalRequests}`
    );

    console.log('action\tqps\treq\tp95\tnon2xx\terrors');
    for (const [action, metrics] of Object.entries(mixedResult.byAction || {})) {
      console.log(
        `${action}\t${Number(metrics.qps || 0).toFixed(2)}\t${Number(metrics.requests || 0)}\t${Number(metrics.latencyMs?.p95 || 0).toFixed(2)}\t${Number(metrics.non2xx || 0)}\t${Number(metrics.errors || 0)}`
      );
    }
  }
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Levels: ${LEVELS.join(', ')}`);
  console.log(`Mixed scenario enabled: ${ENABLE_MIXED_SCENARIO}`);

  const token = await ensureLogin();
  const roomId = await ensurePublicRoom(token);
  console.log(`Using public room: ${roomId}`);

  const httpRows = [];
  for (const users of LEVELS) {
    console.log(`\n[HTTP] Running ${users} users for ${HTTP_DURATION_SEC}s...`);
    const row = await runHttpScenario({ connections: users, token, roomId });
    httpRows.push(row);
  }

  const socketRows = [];
  for (const users of LEVELS) {
    console.log(`\n[SOCKET] Running ${users} concurrent connections...`);
    const row = await runSocketScenario({ clients: users, token, roomId });
    socketRows.push(row);
  }

  let mixedResult = null;
  if (ENABLE_MIXED_SCENARIO) {
    const mixedUsersCount = toPositiveInt(MIXED_USERS, 40);
    const mixedDuration = toPositiveInt(MIXED_DURATION_SEC, 25);
    console.log(`\n[MIXED] Preparing ${mixedUsersCount} synthetic users...`);
    const mixedUsers = await ensureMixedUserTokens(mixedUsersCount);

    console.log(`[MIXED] Running realistic traffic for ${mixedDuration}s...`);
    mixedResult = await runHttpMixedScenario({
      users: mixedUsers,
      roomId,
      durationSec: mixedDuration,
    });
  }

  printTable(httpRows, socketRows, mixedResult);

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    levels: LEVELS,
    mixedConfig: {
      enabled: ENABLE_MIXED_SCENARIO,
      users: toPositiveInt(MIXED_USERS, 40),
      durationSec: toPositiveInt(MIXED_DURATION_SEC, 25),
      pauseMinMs: Math.min(toPositiveInt(MIXED_PAUSE_MIN_MS, 250), toPositiveInt(MIXED_PAUSE_MAX_MS, 600)),
      pauseMaxMs: Math.max(toPositiveInt(MIXED_PAUSE_MIN_MS, 250), toPositiveInt(MIXED_PAUSE_MAX_MS, 600)),
    },
    http: httpRows,
    socket: socketRows,
    mixed: mixedResult,
  };

  const reportName = `chat-load-report-${Date.now()}.json`;
  const reportPath = path.join(__dirname, reportName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch((err) => {
  console.error('Load test failed:', err?.message || err);
  process.exit(1);
});
