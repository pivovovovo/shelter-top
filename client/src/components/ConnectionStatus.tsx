import React, { useState, useEffect } from 'react';
import { socket } from '../lib/socket';

export const ConnectionStatus: React.FC = () => {
  // Инициализируем статус на основе текущего состояния сокета
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>(
    socket.connected ? 'connected' : 'reconnecting'
  );

  useEffect(() => {
    // Если сокет не подключён, пытаемся подключиться
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onReconnect = () => setStatus('reconnecting');
    const onError = () => setStatus('disconnected');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  // Если подключено — ничего не рендерим
  if (status === 'connected') return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-bunker-red text-white text-center py-2 px-4 text-sm font-bold shadow-warm-md animate-fade-in"
         style={{ paddingTop: 'var(--safe-top)' }}>
      {status === 'reconnecting' ? '🔄 Восстановление связи...' : '🔌 Соединение потеряно'}
    </div>
  );
};