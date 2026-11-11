import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { InMemoryRoomRepository } from './repository';
import { generateCharacterCard } from './cardGenerator';
import {
  getRandomProfession,
  getRandomGender,
  getRandomAge,
  getRandomHealth,
  getRandomBadHabit,
  getRandomHobby,
  getRandomLuggage,
  getRandomPhobia,
  getRandomSpecialInfo,
  getRandomFact,
} from './cardGenerator';
import { generateCatastrophe } from './catastropheGenerator';
import { generateBunker } from './bunkerGenerator';
import { generateActionCards, getActionCardTemplate, getStrongCards, ActionCardType } from './actionCardGenerator';

import {
  generateRoomId,
  createRoomSchema,
  joinRoomSchema,
  startGameSchema,
  sendMessageSchema,
  voteSchema,
  revealCardSchema,
  roomActionSchema,
  Player,
  Room,
  CreateRoomInput,
  JoinRoomInput,
  StartGameInput,
  SendMessageInput,
  VoteInput,
  RevealCardInput,
  RoomActionInput,
  ChatMessage,
  ALL_FIELDS,
  RevealedField,
} from './types';

import { authRouter } from './auth';

const app = express();
app.use(cors());
app.use(express.json());          // ← нужно для приема JSON
app.use('/api/auth', authRouter); // ← подключаем маршруты

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
});

const roomRepository = new InMemoryRoomRepository();

const fieldNames: Record<RevealedField, string> = {
  profession: '💼 Профессия',
  gender: '👤 Пол',
  age: '🎂 Возраст',
  health: '❤️ Здоровье',
  badHabit: '🚬 Вредные привычки',
  hobby: '🛠️ Хобби',
  luggage: '🎒 Багаж',
  phobia: '😨 Фобия',
  specialInfo: '🤫 Доп. информация',
  fact: '💡 Факт', // 👈 ДОБАВИТЬ
};

function createPlayer(params: {
  id: string;
  socketId: string;
  name: string;
  isHost: boolean;
  isObserver?: boolean;
}): Player {
  return {
    id: params.id,
    socketId: params.socketId,
    name: params.name,
    isHost: params.isHost,
    isObserver: params.isObserver ?? false,
    isAlive: true,
    revealedFields: [],
    revealedThisRound: [],
    actionCards: params.isObserver ? [] : generateActionCards(),
    hasImmunity: false,
    hasDoubleVote: false,
    hasScholar: false,
    shieldActive: false,
    hostBonusVotes: 0,
    isDiscredited: false,
    isIsolated: false,
    blockedFromVoting: [],
    pendingMutationField: null,
  };
}

// 🆕 Хелпер: получить только играющих (не наблюдателей) живых игроков
function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter((p) => p.isAlive && !p.isObserver);
}

function validatePayload<T>(
  schema: any,
  payload: unknown,
  socket: any,
  callback?: (res: any) => void
): T | null {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const errorMsg = result.error.errors.map((e: any) => e.message).join(', ');

    if (callback) callback({ success: false, error: errorMsg });
    else socket.emit('error', { message: errorMsg });

    return null;
  }

  return result.data as T;
}

function serializeRoom(room: Room) {
  return {
    ...room,
    players: Array.from(room.players.values()),
  };
}

function sendRoom(roomId: string, room: Room) {
  io.to(roomId).emit('roomUpdated', serializeRoom(room));
  broadcastRoomsList();
}

function getRoomsList() {
  return Array.from(roomRepository['rooms'].values())
    .filter((room) => room.status !== 'finished')
    .map((room) => {
      const players = Array.from(room.players.values());
      const host = players.find((p) => p.isHost);

      return {
        id: room.id,
        hostName: host?.name || 'Неизвестно',
        playerCount: players.length,
        maxPlayers: room.maxPlayers,
        bunkerCapacity: room.bunkerCapacity,
        currentRound: room.currentRound,
        status: room.status,
        hasCatastrophe: !!room.catastrophe,
        hasBunker: !!room.bunker,
      };
    });
}

function broadcastRoomsList() {
  io.emit('roomsListUpdated', getRoomsList());
}

function sendSystemMessage(roomId: string, text: string) {
  const room = roomRepository.findRoomById(roomId);
  if (!room) return;

  const message: ChatMessage = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    playerId: '__system__',
    playerName: '🎴 Система',
    text,
    timestamp: Date.now(),
  };

  roomRepository.addMessageToRoom(roomId, message);
  io.to(roomId).emit('newMessage', message);
}

function calculateVoteCounts(room: Room) {
  const counts = new Map<string, number>();

  room.votes.forEach((vote) => {
    const voter = room.players.get(vote.voterId);

    if (voter?.isDiscredited) return;
    if (voter?.isObserver) return; // 🆕 Наблюдатели не голосуют

    const weight = voter?.hasDoubleVote ? 2 : 1;
    counts.set(vote.targetId, (counts.get(vote.targetId) || 0) + weight);
  });

  room.players.forEach((player) => {
    if (player.hostBonusVotes > 0) {
      counts.set(player.id, (counts.get(player.id) || 0) + player.hostBonusVotes);
    }
  });

  return counts;
}

function getLeader(counts: Map<string, number>) {
  let maxVotes = 0;
  let excludedId: string | null = null;
  let isTie = false;

  counts.forEach((count, id) => {
    if (count > maxVotes) {
      maxVotes = count;
      excludedId = id;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  });

  if (isTie) excludedId = null;

  return excludedId;
}

function finishVotingByHost(roomId: string, room: Room, callback: (res: any) => void) {
  const counts = calculateVoteCounts(room);
  let excludedId = getLeader(counts);

  if (excludedId) {
    const excluded = room.players.get(excludedId);

    if (excluded?.isObserver) {
      excludedId = null; // Наблюдателя нельзя исключить
    } else if (excluded?.hasImmunity) {
      excluded.hasImmunity = false;
      excludedId = null;
      sendSystemMessage(roomId, `🛡️ ${excluded.name} использовал иммунитет и не может быть исключён!`);
      io.to(roomId).emit('immunityActivated', {
        playerName: excluded.name,
        message: `🛡️ ${excluded.name} использовал иммунитет и не может быть исключён!`,
      });
    } else if (excluded) {
      excluded.isAlive = false;
      sendSystemMessage(roomId, `☠️ ${excluded.name} покидает бункер...`);
    }
  }

  room.players.forEach((p) => {
    p.hasDoubleVote = false;
    p.hasImmunity = false;
    p.hostBonusVotes = 0;
    p.isDiscredited = false;
    p.isIsolated = false;
  });

  // 🆕 Считаем только играющих (не наблюдателей)
  const aliveCount = getAlivePlayers(room).length;
  const finished = aliveCount <= room.bunkerCapacity;

  room.status = finished ? 'finished' : 'results';

  room.lastVotingResult = {
    excludedPlayerId: excludedId,
    voteCounts: Object.fromEntries(counts),
  };

  sendRoom(roomId, room);

  io.to(roomId).emit('votingFinished', {
    excludedPlayerId: excludedId,
    voteCounts: Object.fromEntries(counts),
    finished,
    confirmedByHost: true,
  });

  callback({
    success: true,
    excludedPlayerId: excludedId,
    finished,
  });
}

io.on('connection', (socket) => {
  console.log(`[Socket] ✅ Подключился: ${socket.id}`);

  // 1. Создание комнаты
  socket.on('createRoom', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<CreateRoomInput>(createRoomSchema, payload, socket, callback);
    if (!data) return;

    if (data.bunkerCapacity >= data.maxPlayers) {
      return callback({ success: false, error: 'Мест в бункере должно быть меньше, чем игроков' });
    }

    const roomId = generateRoomId();

    const hostPlayer = createPlayer({
      id: data.playerId,
      socketId: socket.id,
      name: data.playerName,
      isHost: true,
      isObserver: data.isObserver ?? false, // 🆕
    });

    roomRepository.createRoom(roomId, hostPlayer, data.maxPlayers, data.bunkerCapacity);

    socket.join(roomId);

    const room = roomRepository.findRoomById(roomId)!;

    callback({
      success: true,
      roomId,
      room: serializeRoom(room),
    });

    broadcastRoomsList();
  });

  // 2. Вход в комнату
  socket.on('joinRoom', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<JoinRoomInput>(joinRoomSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);

    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'lobby') return callback({ success: false, error: 'Игра уже началась' });
    if (room.players.size >= room.maxPlayers) {
      return callback({ success: false, error: `Комната заполнена` });
    }

    const player = createPlayer({
      id: data.playerId,
      socketId: socket.id,
      name: data.playerName,
      isHost: false,
    });

    roomRepository.addPlayerToRoom(data.roomId, player);

    socket.join(data.roomId);

    const updated = roomRepository.findRoomById(data.roomId)!;

    sendRoom(data.roomId, updated);

    callback({
      success: true,
      room: serializeRoom(updated),
    });
  });

  // 3. Синхронизация
  socket.on(
    'syncRoom',
    (
      payload: { roomId: string; playerId: string; playerName: string; isHost: boolean },
      callback: (res: any) => void
    ) => {
      const room = roomRepository.findRoomById(payload.roomId);

      if (!room) return callback({ success: false, error: 'Комната не найдена' });

      if (room.players.has(payload.playerId)) {
        const player = room.players.get(payload.playerId)!;
        player.socketId = socket.id;

        if (payload.playerName) player.name = payload.playerName;

        console.log(`[Sync] Игрок ${player.name} переподключился`);
      } else {
        const player = createPlayer({
          id: payload.playerId,
          socketId: socket.id,
          name: payload.playerName || 'Игрок',
          isHost: payload.isHost,
        });

        room.players.set(payload.playerId, player);

        console.log(`[Sync] Новый игрок ${player.name} добавлен в комнату ${payload.roomId}`);
      }

      socket.join(payload.roomId);

      sendRoom(payload.roomId, room);

      callback({
        success: true,
        room: serializeRoom(room),
      });
    }
  );

  // 4. Список комнат
  socket.on('getRoomsList', (callback: (res: any) => void) => {
    callback({
      success: true,
      rooms: getRoomsList(),
    });
  });

  // 5. Чат
  socket.on('sendMessage', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<SendMessageInput>(sendMessageSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const message: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      playerId: data.playerId,
      playerName: data.playerName,
      text: data.text,
      timestamp: Date.now(),
    };

    roomRepository.addMessageToRoom(data.roomId, message);

    io.to(data.roomId).emit('newMessage', message);

    callback({ success: true });
  });

  // 6. Старт игры
  socket.on('startGame', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<StartGameInput>(startGameSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(data.playerId);

    if (!player?.isHost) return callback({ success: false, error: 'Только хост может начать игру' });
    
    // 🆕 Считаем только играющих (не наблюдателей)
    const alivePlayers = getAlivePlayers(room);
    if (alivePlayers.length < 2) return callback({ success: false, error: 'Нужно минимум 2 игрока (не считая наблюдателя)' });

    room.status = 'discussion';
    room.currentRound = 1;
    room.allRevealed = false;
    room.votes = [];
    room.catastrophe = generateCatastrophe();
    room.bunker = generateBunker(room.bunkerCapacity);
    room.pendingRevealRequests = [];
    room.lastVotingResult = null;
    room.referendumActive = false;
    room.referendumProtectedId = null;

    const firstAlive = alivePlayers[0];
    room.currentSpeaker = firstAlive ? firstAlive.id : null;

    room.players.forEach((p) => {
      // 🆕 Наблюдатель не получает карту
      if (p.isObserver) {
        p.card = undefined;
        p.actionCards = [];
        p.isAlive = true;
        p.revealedFields = [];
        p.revealedThisRound = [];
        return;
      }

      p.card = generateCharacterCard();
      p.isAlive = true;
      p.revealedFields = [];
      p.revealedThisRound = [];
      p.hasImmunity = false;
      p.hasDoubleVote = false;
      p.hasScholar = false;
      p.shieldActive = false;
      p.hostBonusVotes = 0;
      p.isDiscredited = false;
      p.isIsolated = false;
      p.blockedFromVoting = [];
      p.pendingMutationField = null;
    });

    sendSystemMessage(data.roomId, `🎲 Игра началась! Катастрофа: ${room.catastrophe.name}`);
    sendSystemMessage(data.roomId, `🏚️ Бункер: ${room.bunker.name}`);

    sendRoom(data.roomId, room);

    callback({ success: true });
  });

  // 7. Моя карточка
  socket.on('getMyCard', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player?.card) return callback({ success: false, error: 'Карточка не найдена' });

    callback({
      success: true,
      card: player.card,
    });
  });

  // 8. Раскрытие характеристики
  socket.on('revealCard', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RevealCardInput>(revealCardSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'discussion') return callback({ success: false, error: 'Сейчас не этап обсуждения' });

    const player = room.players.get(data.playerId);

    if (!player || !player.isAlive) {
      return callback({ success: false, error: 'Игрок не найден или исключён' });
    }

    if (player.isObserver) {
      return callback({ success: false, error: 'Наблюдатель не может раскрывать характеристики' });
    }

    if (player.revealedFields.includes(data.field)) {
      return callback({ success: false, error: 'Это поле уже раскрыто' });
    }

    if (room.currentSpeaker !== data.playerId) {
      return callback({ success: false, error: 'Сейчас не ваша очередь раскрывать характеристики' });
    }

    const baseLimit = room.currentRound === 1 ? 2 : 1;
    const limit = player.hasScholar ? baseLimit + 1 : baseLimit;
    const used = player.revealedThisRound.length;

    if (used >= limit) {
      return callback({
        success: false,
        error: `В этом раунде вы уже раскрыли максимум (${limit}) характеристик`,
      });
    }

    if (room.currentRound === 1 && used === 0 && data.field !== 'profession') {
      return callback({
        success: false,
        error: 'В первом раунде сначала нужно раскрыть ПРОФЕССИЮ',
      });
    }

    player.revealedFields.push(data.field);
    player.revealedThisRound.push(data.field);

    if (player.revealedThisRound.length >= limit) {
      // 🆕 Передаём ход следующему играющему (не наблюдателю)
      const alivePlayers = getAlivePlayers(room);
      const currentIndex = alivePlayers.findIndex((p) => p.id === data.playerId);
      const nextIndex = (currentIndex + 1) % alivePlayers.length;

      room.currentSpeaker = alivePlayers[nextIndex].id;
    }

    sendRoom(data.roomId, room);

    callback({ success: true });
  });

  // 9. Переход к голосованию
  socket.on('startVoting', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RoomActionInput>(roomActionSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (!room.players.get(data.playerId)?.isHost) return callback({ success: false, error: 'Только хост' });
    if (room.status !== 'discussion') return callback({ success: false, error: 'Сейчас не обсуждение' });

    room.status = 'voting';
    room.votes = [];
    room.currentSpeaker = null;
    room.referendumActive = false;
    room.referendumProtectedId = null;

    room.players.forEach((p) => {
      p.hostBonusVotes = 0;
      p.isDiscredited = false;
      p.isIsolated = false;
    });

    sendSystemMessage(data.roomId, `🗳️ Хост начал голосование!`);

    sendRoom(data.roomId, room);

    callback({ success: true });
  });

  // 10. Голос
  socket.on('vote', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<VoteInput>(voteSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Голосование не идёт' });

    const voter = room.players.get(data.playerId);
    const target = room.players.get(data.targetPlayerId);

    if (!voter?.isAlive || !target?.isAlive) {
      return callback({ success: false, error: 'Некорректная цель' });
    }

    // 🆕 Наблюдатель не может голосовать
    if (voter.isObserver) {
      return callback({
        success: false,
        error: `👁️ Вы наблюдатель и не можете голосовать.`,
      });
    }

    // 🆕 Нельзя голосовать за наблюдателя
    if (target.isObserver) {
      return callback({
        success: false,
        error: `👁️ Нельзя голосовать за наблюдателя.`,
      });
    }

    if (voter.isIsolated) {
      return callback({
        success: false,
        error: `🔒 Вы находитесь в самоизоляции и не можете голосовать.`,
      });
    }

    if (target.hasImmunity) {
      return callback({
        success: false,
        error: `🛡️ ${target.name} имеет иммунитет. За него нельзя голосовать.`,
      });
    }

    if (target.blockedFromVoting.includes(data.playerId)) {
      return callback({
        success: false,
        error: `🚫 ${target.name} заблокировал вам голосование против него.`,
      });
    }

    if (room.referendumActive && room.referendumProtectedId === data.targetPlayerId) {
      return callback({
        success: false,
        error: `🔄 Во время референдума нельзя голосовать против ${target.name}.`,
      });
    }

    roomRepository.addVoteToRoom(data.roomId, {
      voterId: data.playerId,
      targetId: data.targetPlayerId,
    });

    const updated = roomRepository.findRoomById(data.roomId)!;

    io.to(data.roomId).emit('voteUpdated', { votes: updated.votes });

    callback({ success: true });
  });

  // 11. Завершение голосования
  socket.on('finishVoting', (payload: { roomId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Голосование не идёт' });

    finishVotingByHost(payload.roomId, room, callback);
  });

  // 12. Подтверждение исключения хостом
  socket.on('confirmExclusion', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });

    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может подтвердить' });

    finishVotingByHost(payload.roomId, room, callback);
  });

  // 13. Пропуск голосования хостом
  socket.on('skipVoting', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });

    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может пропускать голосование' });

    const counts = calculateVoteCounts(room);

    let excludedId: string | null = null;
    let isTie = false;
    let maxVotes = 0;

    counts.forEach((count, id) => {
      if (count > maxVotes) {
        maxVotes = count;
        excludedId = id;
        isTie = false;
      } else if (count === maxVotes && count > 0) {
        isTie = true;
      }
    });

    if (isTie) excludedId = null;

    if (maxVotes === 0) {
      excludedId = null;
      sendSystemMessage(payload.roomId, `⏭️ Хост ${host.name} пропустил голосование. Никто не проголосовал — никто не исключён.`);
    } else if (excludedId) {
      const excluded = room.players.get(excludedId);
      if (excluded?.hasImmunity) {
        excluded.hasImmunity = false;
        excludedId = null;
        sendSystemMessage(payload.roomId, `⏭️ Хост пропустил голосование. 🛡️ ${excluded.name} использовал иммунитет!`);
        io.to(payload.roomId).emit('immunityActivated', {
          playerName: excluded.name,
          message: `🛡️ ${excluded.name} использовал иммунитет!`,
        });
      } else if (excluded) {
        excluded.isAlive = false;
        sendSystemMessage(payload.roomId, `⏭️ Хост пропустил голосование. ☠️ ${excluded.name} покидает бункер (${maxVotes} голосов).`);
      }
    }

    room.players.forEach((p) => {
      p.hasDoubleVote = false;
      p.hasImmunity = false;
      p.hostBonusVotes = 0;
      p.isDiscredited = false;
      p.isIsolated = false;
    });

    const aliveCount = getAlivePlayers(room).length;
    const finished = aliveCount <= room.bunkerCapacity;

    room.status = finished ? 'finished' : 'results';

    room.lastVotingResult = {
      excludedPlayerId: excludedId,
      voteCounts: Object.fromEntries(counts),
    };

    sendRoom(payload.roomId, room);
    io.to(payload.roomId).emit('votingFinished', {
      excludedPlayerId: excludedId,
      voteCounts: Object.fromEntries(counts),
      finished,
      skippedByHost: true,
    });

    callback({ success: true, excludedPlayerId: excludedId, finished });
  });

  // 14. Редактирование голосов хостом
  socket.on('editVoteCount', (payload: { roomId: string; playerId: string; targetId: string; delta: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });

    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может редактировать голоса' });

    const target = room.players.get(payload.targetId);
    if (!target || !target.isAlive) return callback({ success: false, error: 'Игрок не найден или исключён' });
    if (target.isObserver) return callback({ success: false, error: 'Нельзя редактировать голоса наблюдателя' });

    if (payload.delta !== 1 && payload.delta !== -1) {
      return callback({ success: false, error: 'Некорректное изменение' });
    }

    const newValue = target.hostBonusVotes + payload.delta;

    if (newValue < 0) {
      return callback({ success: false, error: 'Нельзя уменьшить ниже 0' });
    }

    target.hostBonusVotes = newValue;

    sendRoom(payload.roomId, room);

    callback({ success: true, newBonus: newValue });
  });

  // 15. Удаление голоса игрока хостом
  socket.on('removePlayerVote', (payload: { roomId: string; playerId: string; voterId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });

    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может удалять голоса' });

    const voteIndex = room.votes.findIndex((v) => v.voterId === payload.voterId);

    if (voteIndex === -1) {
      return callback({ success: false, error: 'Этот игрок ещё не голосовал' });
    }

    const voterName = room.players.get(payload.voterId)?.name || '???';

    room.votes.splice(voteIndex, 1);

    sendSystemMessage(payload.roomId, `🗑️ Хост удалил голос игрока ${voterName}`);

    io.to(payload.roomId).emit('voteUpdated', { votes: room.votes });

    callback({ success: true });
  });

  // 16. Мгновенное исключение игрока хостом
  socket.on('hostExclude', (payload: { roomId: string; playerId: string; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });

    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может исключать игроков' });

    const target = room.players.get(payload.targetId);

    if (!target || !target.isAlive) return callback({ success: false, error: 'Игрок не найден или уже исключён' });
    if (target.isObserver) return callback({ success: false, error: 'Нельзя исключить наблюдателя' });
    if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя исключить самого себя' });

    target.isAlive = false;

    sendSystemMessage(payload.roomId, `⚡ Хост ${host.name} мгновенно исключил игрока ${target.name}!`);

    const counts = calculateVoteCounts(room);

    room.players.forEach((p) => {
      p.hasDoubleVote = false;
      p.hasImmunity = false;
      p.hostBonusVotes = 0;
    });

    const aliveCount = getAlivePlayers(room).length;
    const finished = aliveCount <= room.bunkerCapacity;

    room.status = finished ? 'finished' : 'results';

    room.lastVotingResult = {
      excludedPlayerId: payload.targetId,
      voteCounts: Object.fromEntries(counts),
    };

    sendRoom(payload.roomId, room);

    io.to(payload.roomId).emit('votingFinished', {
      excludedPlayerId: payload.targetId,
      voteCounts: Object.fromEntries(counts),
      finished,
      excludedByHost: true,
      excludedByName: host.name,
    });

    callback({
      success: true,
      excludedPlayerId: payload.targetId,
      finished,
    });
  });

  // 17. Следующий раунд
  socket.on('nextRound', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RoomActionInput>(roomActionSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (!room.players.get(data.playerId)?.isHost) return callback({ success: false, error: 'Только хост' });

    const alive = getAlivePlayers(room);

    if (alive.length <= room.bunkerCapacity) {
      room.status = 'finished';
      sendRoom(data.roomId, room);

      return callback({
        success: true,
        finished: true,
        round: room.currentRound,
      });
    }

    room.currentRound += 1;
    room.status = 'discussion';
    room.votes = [];

    room.players.forEach((p) => {
      if (p.isObserver) return; // 🆕 Наблюдателя не трогаем
      p.revealedThisRound = [];
      p.hasScholar = false;
      p.hostBonusVotes = 0;
      p.blockedFromVoting = [];
      p.isDiscredited = false;
      p.isIsolated = false;
    });

    room.referendumActive = false;
    room.referendumProtectedId = null;

    room.currentSpeaker = alive[0]?.id || null;

    sendSystemMessage(data.roomId, `🔄 Начался Раунд ${room.currentRound}!`);

    sendRoom(data.roomId, room);

    io.to(data.roomId).emit('roundStarted', {
      round: room.currentRound,
    });

    callback({
      success: true,
      finished: false,
      round: room.currentRound,
    });
  });

  // 18. Перевыборы
  socket.on('startRevote', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (!room.players.get(payload.playerId)?.isHost) return callback({ success: false, error: 'Только хост' });
    if (room.status !== 'results') return callback({ success: false, error: 'Перевыборы доступны только после голосования' });

    room.status = 'voting';
    room.votes = [];

    room.players.forEach((p) => {
      p.hostBonusVotes = 0;
    });

    sendSystemMessage(payload.roomId, `⚠️ Хост запустил перевыборы!`);

    sendRoom(payload.roomId, room);

    callback({ success: true });
  });

  // 19. Раскрыть всё
  socket.on('revealAll', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RoomActionInput>(roomActionSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'finished') return callback({ success: false, error: 'Карты раскрываются только после завершения игры' });

    room.players.forEach((p) => {
      if (p.isObserver) return; // 🆕 Наблюдателю нечего раскрывать
      p.revealedFields = [...ALL_FIELDS];
    });

    room.allRevealed = true;

    sendRoom(data.roomId, room);

    callback({ success: true });
  });

  // ============ КАРТЫ ДЕЙСТВИЙ ============

  // Активация пассивной карты
  socket.on('activatePassiveCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден или исключён' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });

    const card = player.actionCards[payload.cardIndex];

    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.category !== 'passive') return callback({ success: false, error: 'Это не пассивная карта' });

    if (card.type === 'scholar') {
      if (room.status !== 'discussion') {
        return callback({ success: false, error: 'Учёного можно активировать только во время обсуждения' });
      }

      player.hasScholar = true;

      const baseLimit = room.currentRound === 1 ? 2 : 1;

      if (player.revealedThisRound.length >= baseLimit) {
        room.currentSpeaker = player.id;
      }
    }

    if (card.type === 'immunity') {
      player.hasImmunity = true;
    }

    if (card.type === 'doubleVote') {
      player.hasDoubleVote = true;
    }

    card.used = true;

    const passiveNames: Record<string, string> = {
      immunity: '🛡️ Иммунитет',
      doubleVote: '🗳️ Двойной голос',
      scholar: '🎓 Учёный',
    };

    sendSystemMessage(payload.roomId, `${player.name} активировал карту ${passiveNames[card.type] || card.name}`);

    sendRoom(payload.roomId, room);

    callback({ success: true });
  });

  // Использование мгновенной карты с целью
    // Использование мгновенной карты С ЦЕЛЬЮ
  socket.on(
    'useActionCard',
    (
      payload: {
        roomId: string;
        playerId: string;
        targetId: string;
        cardIndex: number;
        field?: RevealedField;
      },
      callback: (res: any) => void
    ) => {
      const room = roomRepository.findRoomById(payload.roomId);
      if (!room) return callback({ success: false, error: 'Комната не найдена' });

      const player = room.players.get(payload.playerId);
      const target = room.players.get(payload.targetId);

      if (!player || !target) return callback({ success: false, error: 'Игрок не найден' });
      if (!player.isAlive) return callback({ success: false, error: 'Вы уже исключены' });
      if (!target.isAlive) return callback({ success: false, error: 'Цель уже исключена' });
      if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя применить к себе' });
      if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
      if (target.isObserver) return callback({ success: false, error: 'Нельзя применить карту к наблюдателю' });

      const card = player.actionCards[payload.cardIndex];
      if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
      if (card.category !== 'instant' || !card.needsTarget) return callback({ success: false, error: 'Неверный тип карты' });

      // 👇 ОТЛАДКА: смотрим, какая карта пришла на сервер
      console.log('🎴 useActionCard вызван:', card.type, '| Игрок:', player.name, '| Цель:', target.name);

      if (target.shieldActive) {
        target.shieldActive = false;
        card.used = true;
        sendSystemMessage(payload.roomId, `🛡️ ${target.name} использовал Защиту против ${player.name}! Карта отменена.`);
        sendRoom(payload.roomId, room);
        return callback({ success: false, error: `🛡️ Игрок ${target.name} использовал защиту! Карта отменена.` });
      }

      switch (card.type) {
        case 'swap': {
          if (player.card && target.card) {
            const temp = player.card.profession;
            player.card.profession = target.card.profession;
            target.card.profession = temp;
          }
          sendSystemMessage(payload.roomId, `🔁 ${player.name} использовал Обмен с ${target.name} — их профессии поменялись местами!`);
          break;
        }

        case 'reveal': {
          const field = payload.field;
          if (!field) return callback({ success: false, error: 'Выберите характеристику для вскрытия' });
          if (!ALL_FIELDS.includes(field)) return callback({ success: false, error: 'Некорректная характеристика' });
          if (target.revealedFields.includes(field)) return callback({ success: false, error: 'Эта характеристика уже раскрыта' });
          target.revealedFields.push(field);
          sendSystemMessage(payload.roomId, `👁️ ${player.name} использовал Вскрытие на ${target.name} — раскрыта характеристика: ${fieldNames[field]}`);
          break;
        }

        case 'panic': {
          const unrevealed = ALL_FIELDS.filter((f) => !target.revealedFields.includes(f));
          if (unrevealed.length < 2) return callback({ success: false, error: 'У цели недостаточно нераскрытых характеристик. Нужно минимум 2.' });
          const alreadyPending = room.pendingRevealRequests.some((r) => r.targetPlayerId === target.id);
          if (alreadyPending) return callback({ success: false, error: 'У этого игрока уже есть ожидающее раскрытие от Паники' });
          
          room.pendingRevealRequests.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            targetPlayerId: target.id,
            sourcePlayerId: player.id,
            cardType: 'panic',
            count: 2,
            createdAt: Date.now(),
          });
          sendSystemMessage(payload.roomId, `😱 ${player.name} использовал Панику на ${target.name} — теперь ${target.name} должен раскрыть 2 характеристики!`);
          break;
        }

        // ============ НОВЫЕ КАРТЫ: ИЗМЕНЕНИЕ ХАРАКТЕРИСТИК ВРАГА ============
        case 'forceChangeProfession': target.card!.profession = getRandomProfession(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил профессию ${target.name}!`); break;
        case 'forceChangeGender': target.card!.gender = getRandomGender(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил пол ${target.name}!`); break;
        case 'forceChangeAge': target.card!.age = getRandomAge(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил возраст ${target.name}!`); break;
        case 'forceChangeHealth': target.card!.health = getRandomHealth(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил здоровье ${target.name}!`); break;
        case 'forceChangeBadHabit': target.card!.badHabit = getRandomBadHabit(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил привычки ${target.name}!`); break;
        case 'forceChangeHobby': target.card!.hobby = getRandomHobby(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил хобби ${target.name}!`); break;
        case 'forceChangeLuggage': target.card!.luggage = getRandomLuggage(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил багаж ${target.name}!`); break;
        case 'forceChangePhobia': target.card!.phobia = getRandomPhobia(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил фобию ${target.name}!`); break;
        case 'forceChangeSpecialInfo': target.card!.specialInfo = getRandomSpecialInfo(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил доп. инфо ${target.name}!`); break;
        case 'forceChangeFact': target.card!.fact = getRandomFact(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил факт ${target.name}!`); break;

        default:
          console.log('❌ Неизвестный тип карты на сервере:', card.type); // 👈 отладка
          callback({ success: false, error: 'Неизвестный тип карты' });
          return;
      }

      card.used = true;
      sendRoom(payload.roomId, room);
      callback({ success: true });
    }
  );

  // Использование мгновенной карты без цели (Защита)
    // Использование мгновенной карты С ЦЕЛЬЮ
  socket.on(
    'useActionCard',
    (
      payload: {
        roomId: string;
        playerId: string;
        targetId: string;
        cardIndex: number;
        field?: RevealedField;
      },
      callback: (res: any) => void
    ) => {
      const room = roomRepository.findRoomById(payload.roomId);
      if (!room) return callback({ success: false, error: 'Комната не найдена' });

      const player = room.players.get(payload.playerId);
      const target = room.players.get(payload.targetId);

      if (!player || !target) return callback({ success: false, error: 'Игрок не найден' });
      if (!player.isAlive) return callback({ success: false, error: 'Вы уже исключены' });
      if (!target.isAlive) return callback({ success: false, error: 'Цель уже исключена' });
      if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя применить к себе' });
      if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
      if (target.isObserver) return callback({ success: false, error: 'Нельзя применить карту к наблюдателю' });

      const card = player.actionCards[payload.cardIndex];
      if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
      if (card.category !== 'instant' || !card.needsTarget) return callback({ success: false, error: 'Неверный тип карты' });

      if (target.shieldActive) {
        target.shieldActive = false;
        card.used = true;
        sendSystemMessage(payload.roomId, `🛡️ ${target.name} использовал Защиту против ${player.name}! Карта отменена.`);
        sendRoom(payload.roomId, room);
        return callback({ success: false, error: `🛡️ Игрок ${target.name} использовал защиту! Карта отменена.` });
      }

      switch (card.type) {
        case 'swap': {
          if (player.card && target.card) {
            const temp = player.card.profession;
            player.card.profession = target.card.profession;
            target.card.profession = temp;
          }
          sendSystemMessage(payload.roomId, `🔁 ${player.name} использовал Обмен с ${target.name} — их профессии поменялись местами!`);
          break;
        }

        case 'reveal': {
          const field = payload.field;
          if (!field) return callback({ success: false, error: 'Выберите характеристику для вскрытия' });
          if (!ALL_FIELDS.includes(field)) return callback({ success: false, error: 'Некорректная характеристика' });
          if (target.revealedFields.includes(field)) return callback({ success: false, error: 'Эта характеристика уже раскрыта' });
          target.revealedFields.push(field);
          sendSystemMessage(payload.roomId, `👁️ ${player.name} использовал Вскрытие на ${target.name} — раскрыта характеристика: ${fieldNames[field]}`);
          break;
        }

        case 'panic': {
          const unrevealed = ALL_FIELDS.filter((f) => !target.revealedFields.includes(f));
          if (unrevealed.length < 2) return callback({ success: false, error: 'У цели недостаточно нераскрытых характеристик. Нужно минимум 2.' });
          const alreadyPending = room.pendingRevealRequests.some((r) => r.targetPlayerId === target.id);
          if (alreadyPending) return callback({ success: false, error: 'У этого игрока уже есть ожидающее раскрытие от Паники' });
          
          room.pendingRevealRequests.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            targetPlayerId: target.id,
            sourcePlayerId: player.id,
            cardType: 'panic',
            count: 2,
            createdAt: Date.now(),
          });
          sendSystemMessage(payload.roomId, `😱 ${player.name} использовал Панику на ${target.name} — теперь ${target.name} должен раскрыть 2 характеристики!`);
          break;
        }

        // ============ НОВЫЕ КАРТЫ: ИЗМЕНЕНИЕ ХАРАКТЕРИСТИК ВРАГА ============
        case 'forceChangeProfession': target.card!.profession = getRandomProfession(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил профессию ${target.name}!`); break;
        case 'forceChangeGender': target.card!.gender = getRandomGender(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил пол ${target.name}!`); break;
        case 'forceChangeAge': target.card!.age = getRandomAge(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил возраст ${target.name}!`); break;
        case 'forceChangeHealth': target.card!.health = getRandomHealth(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил здоровье ${target.name}!`); break;
        case 'forceChangeBadHabit': target.card!.badHabit = getRandomBadHabit(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил привычки ${target.name}!`); break;
        case 'forceChangeHobby': target.card!.hobby = getRandomHobby(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил хобби ${target.name}!`); break;
        case 'forceChangeLuggage': target.card!.luggage = getRandomLuggage(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил багаж ${target.name}!`); break;
        case 'forceChangePhobia': target.card!.phobia = getRandomPhobia(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил фобию ${target.name}!`); break;
        case 'forceChangeSpecialInfo': target.card!.specialInfo = getRandomSpecialInfo(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил доп. инфо ${target.name}!`); break;
        case 'forceChangeFact': target.card!.fact = getRandomFact(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил факт ${target.name}!`); break;

        default:
          callback({ success: false, error: 'Неизвестный тип карты' });
          return;
      }

      card.used = true;
      sendRoom(payload.roomId, room);
      callback({ success: true });
    }
  );

  // Превращение джокера
  socket.on('useJoker', (payload: { roomId: string; playerId: string; cardIndex: number; newType: ActionCardType }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден или исключён' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });

    const card = player.actionCards[payload.cardIndex];

    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'joker') return callback({ success: false, error: 'Это не джокер' });
    if (payload.newType === 'joker') return callback({ success: false, error: 'Нельзя превратить в другого джокера' });

    const template = getActionCardTemplate(payload.newType);

    if (!template) return callback({ success: false, error: 'Неверный тип карты' });

    player.actionCards[payload.cardIndex] = {
      ...template,
      used: false,
    };

    sendSystemMessage(payload.roomId, `🃏 Джокер игрока ${player.name} превратился в карту "${template.emoji} ${template.name}"!`);

    sendRoom(payload.roomId, room);

    callback({
      success: true,
      newCard: player.actionCards[payload.cardIndex],
    });
  });

  // Ответ на Панику
  socket.on(
    'respondToPanic',
    (
      payload: {
        roomId: string;
        playerId: string;
        requestId: string;
        field: RevealedField;
      },
      callback: (res: any) => void
    ) => {
      const room = roomRepository.findRoomById(payload.roomId);
      if (!room) return callback({ success: false, error: 'Комната не найдена' });

      const player = room.players.get(payload.playerId);
      if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден или исключён' });

      const requestIndex = room.pendingRevealRequests.findIndex(
        (r) => r.id === payload.requestId && r.targetPlayerId === payload.playerId
      );

      if (requestIndex === -1) {
        return callback({ success: false, error: 'Запрос на раскрытие не найден' });
      }

      if (!ALL_FIELDS.includes(payload.field)) {
        return callback({ success: false, error: 'Некорректная характеристика' });
      }

      if (player.revealedFields.includes(payload.field)) {
        return callback({ success: false, error: 'Эта характеристика уже раскрыта' });
      }

      const request = room.pendingRevealRequests[requestIndex];

      player.revealedFields.push(payload.field);
      request.count -= 1;

      if (request.count <= 0) {
        room.pendingRevealRequests.splice(requestIndex, 1);

        sendSystemMessage(payload.roomId, `😰 ${player.name} под давлением Паники раскрыл последнюю требуемую характеристику: ${fieldNames[payload.field]}`);
      } else {
        sendSystemMessage(payload.roomId, `😰 ${player.name} под давлением Паники раскрыл: ${fieldNames[payload.field]}. Осталось раскрыть: ${request.count}`);
      }

      sendRoom(payload.roomId, room);

      callback({ success: true });
    }
  );

  // ============ МУТАЦИЯ ============
  socket.on('startMutation', (payload: { roomId: string; playerId: string; cardIndex: number; field: RevealedField }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'mutation') return callback({ success: false, error: 'Это не мутация' });

    if (!ALL_FIELDS.includes(payload.field)) return callback({ success: false, error: 'Некорректная характеристика' });

    player.pendingMutationField = payload.field;
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('confirmMutation', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (!player.pendingMutationField) return callback({ success: false, error: 'Сначала выберите характеристику' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });

    const field = player.pendingMutationField;
    if (!player.card) return callback({ success: false, error: 'Нет карточки' });

    let newValue: any;
    switch (field) {
      case 'profession': newValue = getRandomProfession(); player.card.profession = newValue; break;
      case 'gender': newValue = getRandomGender(); player.card.gender = newValue; break;
      case 'age': newValue = getRandomAge(); player.card.age = newValue; break;
      case 'health': newValue = getRandomHealth(); player.card.health = newValue; break;
      case 'badHabit': newValue = getRandomBadHabit(); player.card.badHabit = newValue; break;
      case 'hobby': newValue = getRandomHobby(); player.card.hobby = newValue; break;
      case 'luggage': newValue = getRandomLuggage(); player.card.luggage = newValue; break;
      case 'phobia': newValue = getRandomPhobia(); player.card.phobia = newValue; break;
      case 'specialInfo': newValue = getRandomSpecialInfo(); player.card.specialInfo = newValue; break;
      case 'fact': newValue = getRandomFact(); player.card.fact = newValue; break;
    }

    card.used = true;
    player.pendingMutationField = null;

    const displayValue = Array.isArray(newValue) ? newValue.join(', ') : newValue;
    sendSystemMessage(payload.roomId, `🧬 ${player.name} использовал Мутацию! Его характеристика "${fieldNames[field]}" изменилась на: ${displayValue}`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ РЕФЕРЕНДУМ ============
  socket.on('useReferendum', (payload: { roomId: string; playerId: string; cardIndex: number; protectedId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'voting') return callback({ success: false, error: 'Референдум можно использовать только во время голосования' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'referendum') return callback({ success: false, error: 'Это не референдум' });

    const protectedPlayer = room.players.get(payload.protectedId);
    if (!protectedPlayer || !protectedPlayer.isAlive) return callback({ success: false, error: 'Цель не найдена' });

    room.referendumActive = true;
    room.referendumProtectedId = payload.protectedId;
    room.votes = [];

    card.used = true;

    sendSystemMessage(payload.roomId, `🔄 ${player.name} запустил РЕФЕРЕНДУМ! Голосование начинается заново. Против ${protectedPlayer.name} голосовать нельзя!`);

    io.to(payload.roomId).emit('voteUpdated', { votes: room.votes });
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ СЛАБЫЕ КАРТЫ СМЕН ХАРАКТЕРИСТИК ============
  socket.on('useChangeCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (!player.card) return callback({ success: false, error: 'Нет карточки' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });

    const fieldNamesWeak: Record<string, string> = {
      changeProfession: '💼 Профессия',
      changeGender: '👤 Пол',
      changeAge: '🎂 Возраст',
      changeHealth: '❤️ Здоровье',
      changeBadHabit: '🚬 Вредные привычки',
      changeHobby: '🛠️ Хобби',
      changeLuggage: '🎒 Багаж',
      changePhobia: '😨 Фобия',
      changeSpecialInfo: '🤫 Доп. информация',
    };

    let newValue: any;
    switch (card.type) {
      case 'changeProfession': newValue = getRandomProfession(); player.card.profession = newValue; break;
      case 'changeGender': newValue = getRandomGender(); player.card.gender = newValue; break;
      case 'changeAge': newValue = getRandomAge(); player.card.age = newValue; break;
      case 'changeHealth': newValue = getRandomHealth(); player.card.health = newValue; break;
      case 'changeBadHabit': newValue = getRandomBadHabit(); player.card.badHabit = newValue; break;
      case 'changeHobby': newValue = getRandomHobby(); player.card.hobby = newValue; break;
      case 'changeLuggage': newValue = getRandomLuggage(); player.card.luggage = newValue; break;
      case 'changePhobia': newValue = getRandomPhobia(); player.card.phobia = newValue; break;
      case 'changeSpecialInfo': newValue = getRandomSpecialInfo(); player.card.specialInfo = newValue; break;
      case 'changeFact': newValue = getRandomFact(); player.card.fact = newValue; break;
      case 'doubleFact': newValue = getRandomFact(); player.card.fact2 = newValue; break;
      
      default: return callback({ success: false, error: 'Неизвестный тип карты' });
    }

    card.used = true;
    const displayValue = Array.isArray(newValue) ? newValue.join(', ') : newValue;
    sendSystemMessage(payload.roomId, `${card.emoji} ${player.name} использовал "${card.name}"! Его характеристика "${fieldNamesWeak[card.type]}" изменилась на: ${displayValue}`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ БЛОКИРОВКА ============
  socket.on('useBlockVote', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    const target = room.players.get(payload.targetId);
    if (!player || !target) return callback({ success: false, error: 'Игрок не найден' });
    if (!player.isAlive || !target.isAlive) return callback({ success: false, error: 'Игрок исключён' });
    if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя применить к себе' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (target.isObserver) return callback({ success: false, error: 'Нельзя применить карту к наблюдателю' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'blockVote') return callback({ success: false, error: 'Это не блокировка' });

    if (!target.blockedFromVoting.includes(player.id)) {
      target.blockedFromVoting.push(player.id);
    }

    card.used = true;
    sendSystemMessage(payload.roomId, `🚫 ${player.name} заблокировал ${target.name} — теперь ${target.name} не может голосовать против него!`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ ДИСКРЕДИТАЦИЯ ============
  socket.on('useDiscredit', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    const target = room.players.get(payload.targetId);
    if (!player || !target) return callback({ success: false, error: 'Игрок не найден' });
    if (!player.isAlive || !target.isAlive) return callback({ success: false, error: 'Игрок исключён' });
    if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя применить к себе' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (target.isObserver) return callback({ success: false, error: 'Нельзя применить карту к наблюдателю' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'discredit') return callback({ success: false, error: 'Это не дискредитация' });

    target.isDiscredited = true;
    card.used = true;

    sendSystemMessage(payload.roomId, `📢 ${player.name} дискредитировал ${target.name}! Его голос не будет учитываться в ближайшем голосовании.`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ САМОИЗОЛЯЦИЯ ============
  socket.on('useIsolate', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    const target = room.players.get(payload.targetId);
    if (!player || !target) return callback({ success: false, error: 'Игрок не найден' });
    if (!player.isAlive || !target.isAlive) return callback({ success: false, error: 'Игрок исключён' });
    if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя применить к себе' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (target.isObserver) return callback({ success: false, error: 'Нельзя применить карту к наблюдателю' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });
    if (card.type !== 'isolate') return callback({ success: false, error: 'Это не самоизоляция' });

    target.isIsolated = true;
    card.used = true;

    sendSystemMessage(payload.roomId, `🔒 ${player.name} изолировал ${target.name}! Он не может голосовать в следующем голосовании.`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // ============ ПРОФИ 2 В 1 ============
  socket.on('useDoubleCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.isObserver) return callback({ success: false, error: 'Наблюдатель не может использовать карты' });
    if (!player.card) return callback({ success: false, error: 'Нет карточки' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });

    const fieldNames: Record<string, string> = {
      doubleProfession: '💼 Профессия',
      doubleGender: '👤 Пол',
      doubleAge: '🎂 Возраст',
      doubleHealth: '❤️ Здоровье',
      doubleBadHabit: '🚬 Вредные привычки',
      doubleHobby: '🛠️ Хобби',
      doubleLuggage: '🎒 Багаж',
      doublePhobia: '😨 Фобия',
      doubleSpecialInfo: '🤫 Доп. информация',
    };

    let newValue: any;
    switch (card.type) {
      case 'doubleProfession': newValue = getRandomProfession(); player.card.profession2 = newValue; break;
      case 'doubleGender': newValue = getRandomGender(); player.card.gender2 = newValue; break;
      case 'doubleAge': newValue = getRandomAge(); player.card.age2 = newValue; break;
      case 'doubleHealth': newValue = getRandomHealth(); player.card.health2 = newValue; break;
      case 'doubleBadHabit': newValue = getRandomBadHabit(); player.card.badHabit2 = newValue; break;
      case 'doubleHobby': newValue = getRandomHobby(); player.card.hobby2 = newValue; break;
      case 'doubleLuggage': newValue = getRandomLuggage(); player.card.luggage2 = newValue; break;
      case 'doublePhobia': newValue = getRandomPhobia(); player.card.phobia2 = newValue; break;
      case 'doubleSpecialInfo': newValue = getRandomSpecialInfo(); player.card.specialInfo2 = newValue; break;
      default: return callback({ success: false, error: 'Неизвестный тип карты' });
    }

    card.used = true;
    const displayValue = Array.isArray(newValue) ? newValue.join(', ') : newValue;
    sendSystemMessage(payload.roomId, `${card.emoji} ${player.name} получил вторую "${fieldNames[card.type]}": ${displayValue}!`);

    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

    // 🔄 НОВАЯ ИГРА (перезапуск с теми же игроками)
  socket.on('restartGame', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    
    const host = room.players.get(payload.playerId);
    if (!host?.isHost) return callback({ success: false, error: 'Только хост может перезапустить игру' });

    // 1. Сбрасываем комнату в состояние "Лобби"
    room.status = 'lobby';
    room.currentRound = 1;
    room.allRevealed = false;
    room.votes = [];
    room.catastrophe = null;
    room.bunker = null;
    room.pendingRevealRequests = [];
    room.lastVotingResult = null;
    room.referendumActive = false;
    room.referendumProtectedId = null;
    room.currentSpeaker = null;

    // 2. Очищаем карты и статусы всех игроков
    room.players.forEach((p) => {
      p.isAlive = true;
      p.card = undefined;
      p.revealedFields = [];
      p.revealedThisRound = [];
      p.actionCards = [];
      p.hasImmunity = false;
      p.hasDoubleVote = false;
      p.hasScholar = false;
      p.shieldActive = false;
      p.hostBonusVotes = 0;
      p.isDiscredited = false;
      p.isIsolated = false;
      p.blockedFromVoting = [];
      p.pendingMutationField = null;
    });

    // 3. Уведомляем всех в чате и обновляем комнату
    sendSystemMessage(payload.roomId, `🔄 Хост ${host.name} запустил новую игру! Все возвращаются в лобби.`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log(`[Socket] ❌ Отключился: ${socket.id}`);

    const found = roomRepository.findRoomBySocketId(socket.id);
    if (!found) return;

    const { roomId, room } = found;
    const player = Array.from(room.players.values()).find((p) => p.socketId === socket.id);

    if (!player) return;

    console.log(`[Room] Игрок ${player.name} отключился из комнаты ${roomId}. Статус: ${room.status}`);

    if (room.status !== 'lobby') {
      console.log(`[Room] Игра уже началась. Игрок ${player.name} остаётся в комнате.`);
      return;
    }

    console.log(`[Room] Лобби. Ожидание переподключения игрока ${player.name} 60 сек...`);

    setTimeout(() => {
      const currentRoom = roomRepository.findRoomById(roomId);
      if (!currentRoom) return;

      const currentPlayer = currentRoom.players.get(player.id);

      if (currentPlayer && currentPlayer.socketId === socket.id) {
        console.log(`[Room] Игрок ${player.name} не переподключился за 60 сек. Удаляем.`);

        currentRoom.players.delete(player.id);

        if (player.isHost && currentRoom.players.size > 0) {
          const newHost = Array.from(currentRoom.players.values())[0];
          newHost.isHost = true;

          console.log(`[Room] Новый хост: ${newHost.name}`);
        }

        if (currentRoom.players.size === 0) {
          roomRepository.deleteRoom(roomId);
          console.log(`[Room] Удалена пустая комната: ${roomId}`);
          broadcastRoomsList();
        } else {
          sendRoom(roomId, currentRoom);
        }
      } else {
        console.log(`[Room] Игрок ${player.name} уже переподключился с новым socketId`);
      }
    }, 60000);
  });
});

const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер: http://localhost:${PORT}`);
});