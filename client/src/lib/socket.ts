import { io, Socket } from 'socket.io-client';

const getServerUrl = () => {
  // 1. Если есть переменная окружения — используем её (для продакшена)
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (envUrl) return envUrl;

  // 2. Если открыто не с localhost — используем текущий хост (без порта, через nginx)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}`;
  }

  // 3. Локальная разработка (напрямую к серверу)
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