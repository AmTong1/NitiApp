/* eslint-disable no-console */
const { io } = require('socket.io-client');

const BASE_URL = process.env.LOAD_BASE_URL || 'http://127.0.0.1:4000';
const TIMEOUT_MS = Number(process.env.CHAT_E2E_TIMEOUT_MS || 15000);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeUsername(prefix) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${stamp}_${rand}`;
}

async function jsonFetch(url, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  return { ok: res.ok, status: res.status, payload };
}

async function registerAndLogin(username, password) {
  await jsonFetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    body: { username, password },
  });

  const login = await jsonFetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: { username, password },
  });

  if (!login.ok || !login.payload?.token) {
    throw new Error(`login failed for ${username} (status=${login.status})`);
  }

  const token = login.payload.token;
  const me = await jsonFetch(`${BASE_URL}/auth/me`, { token });
  if (!me.ok || !me.payload?.id) {
    throw new Error(`auth/me failed for ${username} (status=${me.status})`);
  }

  return { username, token, me: me.payload };
}

function connectSocket(token) {
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    extraHeaders: { Authorization: `Bearer ${token}` },
    auth: { token: `Bearer ${token}` },
    reconnection: false,
    timeout: 8000,
    forceNew: true,
  });
  return socket;
}

function waitForEvent(socket, eventName, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`timeout waiting ${label || eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      try {
        if (typeof predicate === 'function' && !predicate(payload)) return;
        clearTimeout(timeout);
        socket.off(eventName, onEvent);
        resolve(payload);
      } catch (e) {
        clearTimeout(timeout);
        socket.off(eventName, onEvent);
        reject(e);
      }
    };

    socket.on(eventName, onEvent);
  });
}

async function ensurePublicRoom(token) {
  const roomRes = await jsonFetch(`${BASE_URL}/chat/public-room`, { token });
  if (!roomRes.ok || !roomRes.payload?.data?.id) {
    throw new Error(`public room failed (status=${roomRes.status})`);
  }
  return Number(roomRes.payload.data.id);
}

async function main() {
  const startedAt = Date.now();
  const pass = {
    socketsJoined: false,
    messageDelivered: false,
    reactionAddedRealtime: false,
    reactionHydratedViaGetMessage: false,
    reactionRemovedRealtime: false,
    readReceiptRealtime: false,
  };

  const userA = await registerAndLogin(makeUsername('e2e_a'), 'Pass#123456');
  const userB = await registerAndLogin(makeUsername('e2e_b'), 'Pass#123456');

  const roomId = await ensurePublicRoom(userA.token);

  const socketA = connectSocket(userA.token);
  const socketB = connectSocket(userB.token);

  try {
    const joinedA = waitForEvent(
      socketA,
      'room_joined',
      (p) => Number(p?.room_id || 0) === roomId,
      TIMEOUT_MS,
      'room_joined A'
    );
    const joinedB = waitForEvent(
      socketB,
      'room_joined',
      (p) => Number(p?.room_id || 0) === roomId,
      TIMEOUT_MS,
      'room_joined B'
    );

    socketA.emit('join_room', { room_id: roomId });
    socketB.emit('join_room', { room_id: roomId });

    await Promise.all([joinedA, joinedB]);
    pass.socketsJoined = true;

    const text = `e2e-message-${Date.now()}`;

    const newMessageOnB = waitForEvent(
      socketB,
      'new_message',
      (msg) => Number(msg?.room_id || 0) === roomId && String(msg?.text || '') === text,
      TIMEOUT_MS,
      'new_message on B'
    );

    const sendRes = await jsonFetch(`${BASE_URL}/chat/messages`, {
      method: 'POST',
      token: userA.token,
      body: { room_id: roomId, text },
    });
    if (!sendRes.ok || !sendRes.payload?.id) {
      throw new Error(`send message failed status=${sendRes.status}`);
    }

    const sentMessage = sendRes.payload;
    const incomingOnB = await newMessageOnB;
    if (Number(incomingOnB?.id || 0) !== Number(sentMessage.id || 0)) {
      throw new Error('new_message id mismatch');
    }
    pass.messageDelivered = true;

    const reactionUpdateAdded = waitForEvent(
      socketB,
      'reaction_update',
      (p) => Number(p?.message_id || 0) === Number(sentMessage.id || 0),
      TIMEOUT_MS,
      'reaction_update add'
    );

    const addReactionRes = await jsonFetch(`${BASE_URL}/chat/reactions`, {
      method: 'POST',
      token: userA.token,
      body: { message_id: sentMessage.id, emoji: '👍' },
    });
    if (!addReactionRes.ok) {
      throw new Error(`add reaction failed status=${addReactionRes.status}`);
    }

    const addedPayload = await reactionUpdateAdded;
    const addedList = Array.isArray(addedPayload?.reactions) ? addedPayload.reactions : [];
    const addedMine = addedList.find((r) => Number(r?.user_id || 0) === Number(userA.me.id || 0));
    if (!addedMine || String(addedMine.emoji) !== '👍') {
      throw new Error('reaction add realtime payload invalid');
    }
    pass.reactionAddedRealtime = true;

    const getMsgRes = await jsonFetch(`${BASE_URL}/chat/messages/${sentMessage.id}?room_id=${roomId}`, {
      token: userB.token,
    });
    if (!getMsgRes.ok || !getMsgRes.payload?.data) {
      throw new Error(`get message by id failed status=${getMsgRes.status}`);
    }
    const hydratedReactions = Array.isArray(getMsgRes.payload.data.reactions)
      ? getMsgRes.payload.data.reactions
      : [];
    const hydratedMine = hydratedReactions.find((r) => Number(r?.user_id || 0) === Number(userA.me.id || 0));
    if (!hydratedMine || String(hydratedMine.emoji) !== '👍') {
      throw new Error('message hydration reactions missing');
    }
    pass.reactionHydratedViaGetMessage = true;

    const reactionUpdateRemoved = waitForEvent(
      socketB,
      'reaction_update',
      (p) => Number(p?.message_id || 0) === Number(sentMessage.id || 0),
      TIMEOUT_MS,
      'reaction_update remove'
    );

    const removeReactionRes = await jsonFetch(`${BASE_URL}/chat/reactions/${sentMessage.id}`, {
      method: 'DELETE',
      token: userA.token,
    });
    if (!removeReactionRes.ok) {
      throw new Error(`remove reaction failed status=${removeReactionRes.status}`);
    }

    const removedPayload = await reactionUpdateRemoved;
    const removedList = Array.isArray(removedPayload?.reactions) ? removedPayload.reactions : [];
    const stillMine = removedList.find((r) => Number(r?.user_id || 0) === Number(userA.me.id || 0));
    if (stillMine) {
      throw new Error('reaction still present after delete');
    }
    pass.reactionRemovedRealtime = true;

    const readReceiptOnA = waitForEvent(
      socketA,
      'message_status',
      (p) => {
        const sameRoom = Number(p?.room_id || 0) === roomId;
        const isRead = String(p?.status || '') === 'read';
        const readerOk = Number(p?.reader_user_id || 0) === Number(userB.me.id || 0);
        const coversMessage = Number(p?.message_id || 0) >= Number(sentMessage.id || 0);
        return sameRoom && isRead && readerOk && coversMessage;
      },
      TIMEOUT_MS,
      'message_status read'
    );

    const markReadRes = await jsonFetch(`${BASE_URL}/chat/rooms/${roomId}/read`, {
      method: 'POST',
      token: userB.token,
    });
    if (!markReadRes.ok) {
      throw new Error(`mark read failed status=${markReadRes.status}`);
    }

    await readReceiptOnA;
    pass.readReceiptRealtime = true;

    const elapsedMs = Date.now() - startedAt;
    console.log(JSON.stringify({ ok: true, elapsedMs, roomId, pass }, null, 2));
  } finally {
    try { socketA.disconnect(); } catch {}
    try { socketB.disconnect(); } catch {}
    await delay(80);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
