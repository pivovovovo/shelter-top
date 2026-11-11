import { io, Socket } from 'socket.io-client';

const getServerUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
};

export const socket: Socket = io(getServerUrl(), {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => console.log('[Socket] ✅ Подключено:', socket.id));
socket.on('disconnect', (reason) => console.log('[Socket] ❌ Отключено:', reason));
socket.on('connect_error', (err) => console.error('[Socket] ⚠️ Ошибка:', err.message));