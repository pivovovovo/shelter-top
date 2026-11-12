import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

import { InMemoryRoomRepository } from './repository';
import { generateCharacterCard } from './cardGenerator';
import {
  getRandomProfession, getRandomGender, getRandomAge, getRandomHealth,
  getRandomBadHabit, getRandomHobby, getRandomLuggage, getRandomPhobia,
  getRandomSpecialInfo, getRandomFact
} from './cardGenerator';
import { generateCatastrophe } from './catastropheGenerator';
import { generateBunker } from './bunkerGenerator';
import { generateActionCards, getActionCardTemplate, ActionCardType } from './actionCardGenerator';
import { authRouter } from './auth';

import {
  generateRoomId, createRoomSchema, joinRoomSchema, startGameSchema,
  sendMessageSchema, voteSchema, revealCardSchema, roomActionSchema,
  Player, Room, CreateRoomInput, JoinRoomInput, StartGameInput,
  SendMessageInput, VoteInput, RevealCardInput, RoomActionInput,
  ChatMessage, ALL_FIELDS, RevealedField,
} from './types';

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
});

const roomRepository = new InMemoryRoomRepository();

const fieldNames: Record<RevealedField, string> = {
  profession: '💼 Профессия', gender: '👤 Пол', age: '🎂 Возраст',
  health: '❤️ Здоровье', badHabit: '🚬 Вредные привычки', hobby: '🛠️ Хобби',
  luggage: '🎒 Багаж', phobia: '😨 Фобия', specialInfo: '🤫 Доп. информация',
  fact: '💡 Факт',
};

function createPlayer(params: {
  id: string; socketId: string; name: string; isHost: boolean; userId?: string;
}): Player {
  return {
    id: params.id,
    socketId: params.socketId,
    name: params.name,
    userId: params.userId,
    isHost: params.isHost,
    isAlive: true,
    revealedFields: [],
    revealedThisRound: [],
    actionCards: generateActionCards(),
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

function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter((p) => p.isAlive);
}

function canControlRoom(room: Room | undefined, playerId: string): boolean {
  if (!room) return false;
  const player = room.players.get(playerId);
  const isCreator = room.creatorId === playerId;
  const isFirstPlayer = Array.from(room.players.values())[0]?.id === playerId;
  return !!(player?.isHost || isCreator || isFirstPlayer);
}

function validatePayload<T>(schema: any, payload: unknown, socket: any, callback?: (res: any) => void): T | null {
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
  return { ...room, players: Array.from(room.players.values()) };
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
        hasPassword: !!room.password,
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
    playerId: '__system__', playerName: '🎴 Система', text, timestamp: Date.now(),
  };
  roomRepository.addMessageToRoom(roomId, message);
  io.to(roomId).emit('newMessage', message);
}

function calculateVoteCounts(room: Room) {
  const counts = new Map<string, number>();
  room.votes.forEach((vote) => {
    const voter = room.players.get(vote.voterId);
    if (voter?.isDiscredited) return;
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
    if (count > maxVotes) { maxVotes = count; excludedId = id; isTie = false; }
    else if (count === maxVotes) { isTie = true; }
  });
  if (isTie) excludedId = null;
  return excludedId;
}

function finishVotingByHost(roomId: string, room: Room, callback: (res: any) => void) {
  const counts = calculateVoteCounts(room);
  let excludedId = getLeader(counts);

  if (excludedId) {
    const excluded = room.players.get(excludedId);
    if (excluded?.hasImmunity) {
      excluded.hasImmunity = false;
      excludedId = null;
      sendSystemMessage(roomId, `🛡️ ${excluded.name} использовал иммунитет и не может быть исключён!`);
      io.to(roomId).emit('immunityActivated', { playerName: excluded.name, message: `🛡️ ${excluded.name} использовал иммунитет!` });
    } else if (excluded) {
      excluded.isAlive = false;
      sendSystemMessage(roomId, `☠️ ${excluded.name} покидает бункер...`);
    }
  }

  room.players.forEach((p) => {
    p.hasDoubleVote = false; p.hasImmunity = false; p.hostBonusVotes = 0;
    p.isDiscredited = false; p.isIsolated = false;
  });

  const aliveCount = getAlivePlayers(room).length;
  const finished = aliveCount <= room.bunkerCapacity;
  room.status = finished ? 'finished' : 'results';
  room.lastVotingResult = { excludedPlayerId: excludedId, voteCounts: Object.fromEntries(counts) };

  sendRoom(roomId, room);
  io.to(roomId).emit('votingFinished', { excludedPlayerId: excludedId, voteCounts: Object.fromEntries(counts), finished, confirmedByHost: true });
  callback({ success: true, excludedPlayerId: excludedId, finished });
}

async function saveGameStats(room: Room) {
  if (room.status !== 'finished') return;
  
  const alivePlayers = getAlivePlayers(room);
  const finished = alivePlayers.length <= room.bunkerCapacity;
  if (!finished) return;

  for (const player of room.players.values()) {
    if (player.userId) {
      try {
        await prisma.user.update({
          where: { id: player.userId },
          data: {
            gamesPlayed: { increment: 1 },
            gamesWon: { increment: player.isAlive ? 1 : 0 },
          },
        });
      } catch (e) { console.error('Ошибка сохранения статистики:', e); }
    }
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] ✅ Подключился: ${socket.id}`);

  // 1. Создание комнаты
  socket.on('createRoom', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<CreateRoomInput>(createRoomSchema, payload, socket, callback);
    if (!data) return;
    if (data.bunkerCapacity >= data.maxPlayers) return callback({ success: false, error: 'Мест в бункере должно быть меньше, чем игроков' });

    const roomId = generateRoomId();
    const hostPlayer = createPlayer({
      id: data.playerId, socketId: socket.id, name: data.playerName,
      isHost: true, userId: (payload as any).userId,
    });

    roomRepository.createRoom(roomId, hostPlayer, data.maxPlayers, data.bunkerCapacity, data.password);
    socket.join(roomId);

    const room = roomRepository.findRoomById(roomId)!;
    callback({ success: true, roomId, room: serializeRoom(room) });
    broadcastRoomsList();
  });

  // 2. Вход в комнату
  socket.on('joinRoom', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<JoinRoomInput>(joinRoomSchema, payload, socket, callback);
    if (!data) return;

    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'lobby') return callback({ success: false, error: 'Игра уже началась' });
    if (room.players.size >= room.maxPlayers) return callback({ success: false, error: 'Комната заполнена' });
    if (room.password && room.password !== data.password) return callback({ success: false, error: 'Неверный пароль' });

    const player = createPlayer({
      id: data.playerId, socketId: socket.id, name: data.playerName,
      isHost: false, userId: (payload as any).userId,
    });

    roomRepository.addPlayerToRoom(data.roomId, player);
    socket.join(data.roomId);
    const updated = roomRepository.findRoomById(data.roomId)!;
    sendRoom(data.roomId, updated);
    callback({ success: true, room: serializeRoom(updated) });
  });

  // 3. Синхронизация
  socket.on('syncRoom', (payload: any, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    if (room.players.has(payload.playerId)) {
      const player = room.players.get(payload.playerId)!;
      player.socketId = socket.id;
      if (payload.playerName) player.name = payload.playerName;
      if (payload.userId) player.userId = payload.userId;
    } else {
      const player = createPlayer({
        id: payload.playerId, socketId: socket.id, name: payload.playerName || 'Игрок',
        isHost: payload.isHost, userId: payload.userId,
      });
      room.players.set(payload.playerId, player);
    }

    socket.join(payload.roomId);
    sendRoom(payload.roomId, room);
    callback({ success: true, room: serializeRoom(room) });
  });

  // 3.1 Подключение большого экрана
  socket.on('joinBoard', (payload: { roomId: string; password?: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.password && room.password !== payload.password) return callback({ success: false, error: 'Неверный пароль' });
    socket.join(payload.roomId);
    callback({ success: true, room: serializeRoom(room) });
  });

  // 4. Список комнат
  socket.on('getRoomsList', (callback: (res: any) => void) => {
    callback({ success: true, rooms: getRoomsList() });
  });

  // 5. Чат
  socket.on('sendMessage', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<SendMessageInput>(sendMessageSchema, payload, socket, callback);
    if (!data) return;
    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const message: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      playerId: data.playerId, playerName: data.playerName, text: data.text, timestamp: Date.now(),
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
    if (!player?.isHost) return callback({ success: false, error: 'Только хост может начать' });
    
    const alivePlayers = getAlivePlayers(room);
    if (alivePlayers.length < 2) return callback({ success: false, error: 'Нужно минимум 2 игрока' });

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
    room.currentSpeaker = alivePlayers[0]?.id || null;

    room.players.forEach((p) => {
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
    callback({ success: true, card: player.card });
  });

  // 8. Раскрытие характеристики
   socket.on('revealCard', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RevealCardInput>(revealCardSchema, payload, socket, callback);
    if (!data) return;
    const room = roomRepository.findRoomById(data.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'discussion') return callback({ success: false, error: 'Сейчас не этап обсуждения' });

    const player = room.players.get(data.playerId);
    if (!player || !player.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (player.revealedFields.includes(data.field)) return callback({ success: false, error: 'Это поле уже раскрыто' });

    const baseLimit = room.currentRound <= 2 ? 2 : 1;
    const limit = player.hasScholar ? baseLimit + 1 : baseLimit;
    const used = player.revealedThisRound.length;

    if (used >= limit) return callback({ success: false, error: `Вы уже раскрыли максимум (${limit})` });
    if (room.currentRound === 1 && used === 0 && data.field !== 'profession') {
      return callback({ success: false, error: 'В первом раунде сначала нужно раскрыть ПРОФЕССИЮ' });
    }

    player.revealedFields.push(data.field);
    player.revealedThisRound.push(data.field);

    console.log(`[reveal] ${player.name}: ${data.field} (${player.revealedThisRound.length}/${limit})`);

    if (player.revealedThisRound.length >= limit) {
      const alive = getAlivePlayers(room);
      const currentIndex = alive.findIndex((p) => p.id === data.playerId);
      room.currentSpeaker = alive[(currentIndex + 1) % alive.length].id;
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

    const player = room.players.get(data.playerId);
    const isCreator = room.creatorId === data.playerId;
    const isFirstPlayer = Array.from(room.players.values())[0]?.id === data.playerId;
    
    if (!player?.isHost && !isCreator && !isFirstPlayer) {
      return callback({ success: false, error: 'Только хост' });
    }

    // 👇 Если уже голосование — просто подтверждаем
    if (room.status === 'voting') {
      return callback({ success: true, alreadyVoting: true });
    }

    // 👇 Если лобби — просим сначала начать игру
    if (room.status === 'lobby') {
      return callback({ success: false, error: 'Игра ещё не началась. Нажмите "Начать игру" в лобби.' });
    }

    // 👇 Если результаты или финал — тоже говорим что не время
    if (room.status === 'results' || room.status === 'finished') {
      return callback({ success: false, error: 'Раунд уже завершён. Нажмите "Следующий раунд".' });
    }

    // status === 'discussion' — начинаем голосование
    room.status = 'voting';
    room.votes = [];
    room.currentSpeaker = null;
    room.referendumActive = false;
    room.referendumProtectedId = null;
    room.players.forEach((p) => { p.hostBonusVotes = 0; p.isDiscredited = false; p.isIsolated = false; });
    
    sendSystemMessage(data.roomId, `🗳️ Хост начал голосование!`);
    sendRoom(data.roomId, room);
    callback({ success: true });
  });

  // 10. Голос
  socket.on('vote', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<VoteInput>(voteSchema, payload, socket, callback);
    if (!data) return;
    const room = roomRepository.findRoomById(data.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Голосование не идёт' });
    
    const voter = room.players.get(data.playerId);
    const target = room.players.get(data.targetPlayerId);
    if (!voter?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Некорректная цель' });
    if (voter.isIsolated) return callback({ success: false, error: 'Вы в самоизоляции' });
    if (target.hasImmunity) return callback({ success: false, error: 'У цели иммунитет' });
    if (target.blockedFromVoting.includes(data.playerId)) return callback({ success: false, error: 'Вам заблокировали голос' });
    if (room.referendumActive && room.referendumProtectedId === data.targetPlayerId) return callback({ success: false, error: 'Цель защищена референдумом' });

    roomRepository.addVoteToRoom(data.roomId, { voterId: data.playerId, targetId: data.targetPlayerId });
    io.to(data.roomId).emit('voteUpdated', { votes: roomRepository.findRoomById(data.roomId)!.votes });
    callback({ success: true });
  });

  // 11. Завершение голосования
  socket.on('finishVoting', (payload: { roomId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Голосование не идёт' });
    if (!canControlRoom(room, payload.roomId)) return callback({ success: false, error: 'Только хост' });
    finishVotingByHost(payload.roomId, room, callback);
    saveGameStats(room);
  });

  // 12. Подтверждение исключения
  socket.on('confirmExclusion', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    finishVotingByHost(payload.roomId, room, callback);
    saveGameStats(room);
  });

  // 13. Пропуск голосования
  socket.on('skipVoting', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    const counts = calculateVoteCounts(room);
    let excludedId = getLeader(counts);
    let maxVotes = 0;
    counts.forEach(c => { if (c > maxVotes) maxVotes = c; });
    if (maxVotes === 0) excludedId = null;

    if (excludedId) {
      const excluded = room.players.get(excludedId);
      if (excluded) { excluded.isAlive = false; sendSystemMessage(payload.roomId, `☠️ ${excluded.name} покидает бункер`); }
    }

    room.players.forEach((p) => { p.hasDoubleVote = false; p.hasImmunity = false; p.hostBonusVotes = 0; p.isDiscredited = false; p.isIsolated = false; });

    const aliveCount = getAlivePlayers(room).length;
    const finished = aliveCount <= room.bunkerCapacity;
    room.status = finished ? 'finished' : 'results';
    room.lastVotingResult = { excludedPlayerId: excludedId, voteCounts: Object.fromEntries(counts) };

    sendRoom(payload.roomId, room);
    io.to(payload.roomId).emit('votingFinished', { excludedPlayerId: excludedId, voteCounts: Object.fromEntries(counts), finished, skippedByHost: true });
    callback({ success: true, excludedPlayerId: excludedId, finished });
    saveGameStats(room);
  });

  // 14. Редактирование голосов хостом
  socket.on('editVoteCount', (payload: { roomId: string; playerId: string; targetId: string; delta: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    const target = room.players.get(payload.targetId);
    if (!target || !target.isAlive) return callback({ success: false, error: 'Игрок не найден' });

    const newValue = target.hostBonusVotes + payload.delta;
    if (newValue < 0) return callback({ success: false, error: 'Нельзя меньше 0' });
    target.hostBonusVotes = newValue;
    sendRoom(payload.roomId, room);
    callback({ success: true, newBonus: newValue });
  });

  // 15. Удаление голоса хостом
  socket.on('removePlayerVote', (payload: { roomId: string; playerId: string; voterId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    const voteIndex = room.votes.findIndex((v) => v.voterId === payload.voterId);
    if (voteIndex === -1) return callback({ success: false, error: 'Этот игрок ещё не голосовал' });

    room.votes.splice(voteIndex, 1);
    io.to(payload.roomId).emit('voteUpdated', { votes: room.votes });
    callback({ success: true });
  });

  // 16. Мгновенное исключение хостом
  socket.on('hostExclude', (payload: { roomId: string; playerId: string; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Сейчас не голосование' });
   if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    const target = room.players.get(payload.targetId);
    if (!target || !target.isAlive || payload.playerId === payload.targetId) return callback({ success: false, error: 'Некорректная цель' });

    target.isAlive = false;
    const counts = calculateVoteCounts(room);
    room.players.forEach((p) => { p.hasDoubleVote = false; p.hasImmunity = false; p.hostBonusVotes = 0; });

    const aliveCount = getAlivePlayers(room).length;
    const finished = aliveCount <= room.bunkerCapacity;
    room.status = finished ? 'finished' : 'results';
    room.lastVotingResult = { excludedPlayerId: payload.targetId, voteCounts: Object.fromEntries(counts) };

    sendSystemMessage(payload.roomId, `⚡ Хост исключил игрока ${target.name}!`);
    sendRoom(payload.roomId, room);
    io.to(payload.roomId).emit('votingFinished', { excludedPlayerId: payload.targetId, voteCounts: Object.fromEntries(counts), finished, excludedByHost: true });
    callback({ success: true, excludedPlayerId: payload.targetId, finished });
    saveGameStats(room);
  });

  // 17. Следующий раунд
    socket.on('nextRound', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RoomActionInput>(roomActionSchema, payload, socket, callback);
    if (!data) return;
    const room = roomRepository.findRoomById(data.roomId);
    
    console.log(`[nextRound] Запрос от ${data.playerId}, статус: ${room?.status}, раунд: ${room?.currentRound}`);
    
    if (!canControlRoom(room, data.playerId)) {
      console.log(`[nextRound] ❌ Нет прав`);
      return callback({ success: false, error: 'Только хост или создатель' });
    }

    if (room!.status !== 'results') {
      return callback({ 
        success: false, 
        error: `Нельзя начать новый раунд сейчас (статус: ${room!.status}). Завершите обсуждение голосованием.` 
      });
    }

    const alive = getAlivePlayers(room!);
    if (alive.length <= room!.bunkerCapacity) {
      room!.status = 'finished';
      sendRoom(data.roomId, room!);
      return callback({ success: true, finished: true });
    }

    room!.currentRound += 1;
    room!.status = 'discussion';
    room!.votes = [];
    room!.players.forEach((p) => {
      p.revealedThisRound = []; p.hasScholar = false; p.hostBonusVotes = 0;
      p.blockedFromVoting = []; p.isDiscredited = false; p.isIsolated = false;
    });
    room!.referendumActive = false; room!.referendumProtectedId = null;
    room!.currentSpeaker = alive[0]?.id || null;

    console.log(`[nextRound] ✅ Новый раунд: ${room!.currentRound}`);
    sendSystemMessage(data.roomId, `🔄 Начался Раунд ${room!.currentRound}!`);
    sendRoom(data.roomId, room!);
    io.to(data.roomId).emit('roundStarted', { round: room!.currentRound });
    callback({ success: true, finished: false, round: room!.currentRound });
  });

  // 17.1 Новая игра
  socket.on('restartGame', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    room.status = 'lobby'; room.currentRound = 1; room.allRevealed = false;
    room.votes = []; room.catastrophe = null; room.bunker = null;
    room.pendingRevealRequests = []; room.lastVotingResult = null;
    room.referendumActive = false; room.referendumProtectedId = null; room.currentSpeaker = null;

    room.players.forEach((p) => {
      p.isAlive = true; p.card = undefined; p.revealedFields = []; p.revealedThisRound = [];
      p.actionCards = []; p.hasImmunity = false; p.hasDoubleVote = false;
      p.hasScholar = false; p.shieldActive = false; p.hostBonusVotes = 0;
      p.isDiscredited = false; p.isIsolated = false; p.blockedFromVoting = []; p.pendingMutationField = null;
    });

    sendSystemMessage(payload.roomId, `🔄 Хост запустил новую игру! Все в лобби.`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // 18. Перевыборы
  socket.on('startRevote', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || !canControlRoom(room, payload.playerId) || room.status !== 'results') return callback({ success: false, error: 'Ошибка' });
    room.status = 'voting'; room.votes = [];
    room.players.forEach((p) => { p.hostBonusVotes = 0; });
    sendSystemMessage(payload.roomId, `⚡ Хост запустил перевыборы!`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // 19. Раскрыть всё
  socket.on('revealAll', (payload: unknown, callback: (res: any) => void) => {
    const data = validatePayload<RoomActionInput>(roomActionSchema, payload, socket, callback);
    if (!data) return;
    const room = roomRepository.findRoomById(data.roomId);
    if (!room || room.status !== 'finished') return callback({ success: false, error: 'Только после игры' });
    room.players.forEach((p) => { p.revealedFields = [...ALL_FIELDS]; });
    room.allRevealed = true;
    sendRoom(data.roomId, room);
    callback({ success: true });
  });

  // ============ КАРТЫ ============

  socket.on('activatePassiveCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    const player = room.players.get(payload.playerId);
    if (!player?.isAlive) return callback({ success: false, error: 'Игрок не найден' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.category !== 'passive') return callback({ success: false, error: 'Недоступно' });

    if (card.type === 'scholar') {
      player.hasScholar = true;
      const baseLimit = room.currentRound <= 2 ? 2 : 1;
      if (player.revealedThisRound.length >= baseLimit) room.currentSpeaker = player.id;
    }
    if (card.type === 'immunity') player.hasImmunity = true;
    if (card.type === 'doubleVote') player.hasDoubleVote = true;

    card.used = true;
    sendSystemMessage(payload.roomId, `${player.name} активировал ${card.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useActionCard', (payload: { roomId: string; playerId: string; targetId: string; cardIndex: number; field?: RevealedField }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });

    const player = room.players.get(payload.playerId);
    const target = room.players.get(payload.targetId);
    if (!player?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Игрок не найден' });
    if (payload.playerId === payload.targetId) return callback({ success: false, error: 'Нельзя к себе' });

    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.category !== 'instant' || !card.needsTarget) return callback({ success: false, error: 'Неверный тип' });

    if (target.shieldActive) {
      target.shieldActive = false; card.used = true;
      sendSystemMessage(payload.roomId, `🛡️ ${target.name} отразил карту от ${player.name}!`);
      sendRoom(payload.roomId, room);
      return callback({ success: false, error: 'Защита!' });
    }

    switch (card.type) {
      case 'swap':
        if (player.card && target.card) { const t = player.card.profession; player.card.profession = target.card.profession; target.card.profession = t; }
        sendSystemMessage(payload.roomId, `🔁 ${player.name} обменялся профессией с ${target.name}`);
        break;
      case 'reveal':
        const field = payload.field;
        if (!field || target.revealedFields.includes(field)) return callback({ success: false, error: 'Поле уже раскрыто' });
        target.revealedFields.push(field);
        sendSystemMessage(payload.roomId, `👁️ ${player.name} вскрыл ${fieldNames[field]} у ${target.name}`);
        break;
      case 'panic':
        if (ALL_FIELDS.filter(f => !target.revealedFields.includes(f)).length < 2) return callback({ success: false, error: 'Мало полей' });
        room.pendingRevealRequests.push({ id: Date.now().toString(), targetPlayerId: target.id, sourcePlayerId: player.id, cardType: 'panic', count: 2, createdAt: Date.now() });
        sendSystemMessage(payload.roomId, `😱 ${player.name} наложил Панику на ${target.name}`);
        break;
      case 'forceChangeProfession': target.card!.profession = getRandomProfession(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил профессию ${target.name}`); break;
      case 'forceChangeGender': target.card!.gender = getRandomGender(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил пол ${target.name}`); break;
      case 'forceChangeAge': target.card!.age = getRandomAge(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил возраст ${target.name}`); break;
      case 'forceChangeHealth': target.card!.health = getRandomHealth(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил здоровье ${target.name}`); break;
      case 'forceChangeBadHabit': target.card!.badHabit = getRandomBadHabit(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил привычки ${target.name}`); break;
      case 'forceChangeHobby': target.card!.hobby = getRandomHobby(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил хобби ${target.name}`); break;
      case 'forceChangeLuggage': target.card!.luggage = getRandomLuggage(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил багаж ${target.name}`); break;
      case 'forceChangePhobia': target.card!.phobia = getRandomPhobia(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил фобию ${target.name}`); break;
      case 'forceChangeSpecialInfo': target.card!.specialInfo = getRandomSpecialInfo(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил доп. инфо ${target.name}`); break;
      case 'forceChangeFact': target.card!.fact = getRandomFact(); sendSystemMessage(payload.roomId, `👿 ${player.name} изменил факт ${target.name}`); break;
      default: return callback({ success: false, error: 'Неизвестный тип' });
    }
    card.used = true;
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useActionCardNoTarget', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'shield') return callback({ success: false, error: 'Не Защита' });
    player.shieldActive = true; card.used = true;
    sendSystemMessage(payload.roomId, `🛡️ ${player.name} активировал Защиту`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useJoker', (payload: { roomId: string; playerId: string; cardIndex: number; newType: ActionCardType }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'joker') return callback({ success: false, error: 'Не джокер' });
    const template = getActionCardTemplate(payload.newType);
    if (!template || payload.newType === 'joker') return callback({ success: false, error: 'Неверный тип' });
    player.actionCards[payload.cardIndex] = { ...template, used: false };
    sendSystemMessage(payload.roomId, `🃏 Джокер ${player.name} стал картой "${template.name}"`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('respondToPanic', (payload: { roomId: string; playerId: string; requestId: string; field: RevealedField }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const reqIndex = room.pendingRevealRequests.findIndex(r => r.id === payload.requestId && r.targetPlayerId === payload.playerId);
    if (reqIndex === -1) return callback({ success: false, error: 'Запрос не найден' });
    if (player.revealedFields.includes(payload.field)) return callback({ success: false, error: 'Уже раскрыто' });

    player.revealedFields.push(payload.field);
    const req = room.pendingRevealRequests[reqIndex];
    req.count -= 1;
    if (req.count <= 0) room.pendingRevealRequests.splice(reqIndex, 1);
    sendSystemMessage(payload.roomId, `😨 ${player.name} раскрыл ${fieldNames[payload.field]} под Паникой`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('startMutation', (payload: { roomId: string; playerId: string; cardIndex: number; field: RevealedField }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'mutation') return callback({ success: false, error: 'Не мутация' });
    player.pendingMutationField = payload.field;
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('confirmMutation', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive || !player.card || !player.pendingMutationField) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Карта недоступна' });

    const field = player.pendingMutationField;
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
    card.used = true; player.pendingMutationField = null;
    sendSystemMessage(payload.roomId, `🧬 ${player.name} мутировал ${fieldNames[field]}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useReferendum', (payload: { roomId: string; playerId: string; cardIndex: number; protectedId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room || room.status !== 'voting') return callback({ success: false, error: 'Не голосование' });
    const player = room?.players.get(payload.playerId);
    const target = room?.players.get(payload.protectedId);
    if (!player?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'referendum') return callback({ success: false, error: 'Не референдум' });

    room.referendumActive = true; room.referendumProtectedId = payload.protectedId; room.votes = []; card.used = true;
    sendSystemMessage(payload.roomId, `🔔 ${player.name} запустил Референдум! ${target.name} защищён.`);
    io.to(payload.roomId).emit('voteUpdated', { votes: room.votes });
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useChangeCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive || !player.card) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Недоступно' });

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
      default: return callback({ success: false, error: 'Неизвестный тип' });
    }
    card.used = true;
    sendSystemMessage(payload.roomId, `${card.emoji} ${player.name} применил ${card.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useDoubleCard', (payload: { roomId: string; playerId: string; cardIndex: number }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    if (!room || !player?.isAlive || !player.card) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used) return callback({ success: false, error: 'Недоступно' });

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
      case 'doubleFact': newValue = getRandomFact(); player.card.fact2 = newValue; break;
      default: return callback({ success: false, error: 'Неизвестный тип' });
    }
    card.used = true;
    sendSystemMessage(payload.roomId, `${card.emoji} ${player.name} применил ${card.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useBlockVote', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    const target = room?.players.get(payload.targetId);
    if (!room || !player?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'blockVote') return callback({ success: false, error: 'Не Блокировка' });

    if (!target.blockedFromVoting.includes(player.id)) target.blockedFromVoting.push(player.id);
    card.used = true;
    sendSystemMessage(payload.roomId, `🚫 ${player.name} заблокировал голос ${target.name} против себя`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useDiscredit', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    const target = room?.players.get(payload.targetId);
    if (!room || !player?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'discredit') return callback({ success: false, error: 'Не Дискредитация' });

    target.isDiscredited = true;
    card.used = true;
    sendSystemMessage(payload.roomId, `📢 ${player.name} дискредитировал ${target.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  socket.on('useIsolate', (payload: { roomId: string; playerId: string; cardIndex: number; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    const player = room?.players.get(payload.playerId);
    const target = room?.players.get(payload.targetId);
    if (!room || !player?.isAlive || !target?.isAlive) return callback({ success: false, error: 'Ошибка' });
    const card = player.actionCards[payload.cardIndex];
    if (!card || card.used || card.type !== 'isolate') return callback({ success: false, error: 'Не Самоизоляция' });

    target.isIsolated = true;
    card.used = true;
    sendSystemMessage(payload.roomId, `🔒 ${player.name} изолировал ${target.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // 20. Выйти из комнаты
  socket.on('leaveRoom', (payload: { roomId: string; playerId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false });
    const player = room.players.get(payload.playerId);
    if (!player) return callback({ success: false });

    room.players.delete(payload.playerId);
    socket.leave(payload.roomId);

    if (player.isHost && room.players.size > 0) {
      const nextPlayer = Array.from(room.players.values())[0];
      nextPlayer.isHost = true;
      sendSystemMessage(payload.roomId, `👑 Хост ${player.name} вышел. Новый хост: ${nextPlayer.name}`);
    }
    if (room.players.size === 0) {
      roomRepository.deleteRoom(payload.roomId);
    } else {
      sendSystemMessage(payload.roomId, `🚪 Игрок ${player.name} покинул комнату`);
      sendRoom(payload.roomId, room);
    }
    callback({ success: true });
  });

  // 21. Кик игрока
  socket.on('kickPlayer', (payload: { roomId: string; playerId: string; targetId: string }, callback: (res: any) => void) => {
    const room = roomRepository.findRoomById(payload.roomId);
    if (!room) return callback({ success: false, error: 'Комната не найдена' });
    if (!canControlRoom(room, payload.playerId)) return callback({ success: false, error: 'Только хост' });
    const target = room.players.get(payload.targetId);
    if (!target) return callback({ success: false, error: 'Игрок не найден' });

    room.players.delete(payload.targetId);
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) { targetSocket.emit('kicked'); targetSocket.leave(payload.roomId); }
    sendSystemMessage(payload.roomId, `👢 Хост кикнул игрока ${target.name}`);
    sendRoom(payload.roomId, room);
    callback({ success: true });
  });

  // Отключение
  socket.on('disconnect', () => {
    const found = roomRepository.findRoomBySocketId(socket.id);
    if (!found) return;
    const { roomId, room } = found;
    const player = Array.from(room.players.values()).find((p) => p.socketId === socket.id);
    if (!player) return;

    if (room.status !== 'lobby') return;

    setTimeout(() => {
      const currentRoom = roomRepository.findRoomById(roomId);
      if (!currentRoom) return;
      const currentPlayer = currentRoom.players.get(player.id);

      if (currentPlayer && currentPlayer.socketId === socket.id) {
        currentRoom.players.delete(player.id);
        if (player.isHost && currentRoom.players.size > 0) {
          const newHost = Array.from(currentRoom.players.values())[0];
          newHost.isHost = true;
        }
        if (currentRoom.players.size === 0) {
          roomRepository.deleteRoom(roomId);
          broadcastRoomsList();
        } else {
          sendRoom(roomId, currentRoom);
        }
      }
    }, 60000);
  });
});

const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер: http://localhost:${PORT}`);
});