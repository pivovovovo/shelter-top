import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { BottomSheet } from '../ui/BottomSheet';
import { Chat } from '../Chat';

const AVATARS = ['🧑‍🚀', '👨‍🔬', '👩‍⚕️', '🧙', '👨‍🍳', '👩‍🎨', '🕵️', '🧑‍🌾', '👨‍✈️', '👩‍🚒'];
const getAvatar = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(hash) % AVATARS.length];
};

export const Lobby: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [room, setRoom] = useState<any>(location.state?.room || null);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => {
    socket.connect();
    
    // Принудительная синхронизация при заходе (важно для рестарта игры)
    if (roomId && playerId) {
      setIsSyncing(true);
      socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (res: any) => {
        setIsSyncing(false);
        if (res?.success) setRoom(res.room);
        else navigate('/');
      });
    }

    const onRoomUpdated = (r: any) => {
      setRoom(r);
      if (r.status === 'discussion') navigate(`/game/${roomId}`);
    };

    const onKicked = () => {
      alert('Вас исключили из комнаты (кик от хоста)');
      navigate('/');
    };

    socket.on('roomUpdated', onRoomUpdated);
    socket.on('kicked', onKicked);
    
    return () => { 
      socket.off('roomUpdated', onRoomUpdated); 
      socket.off('kicked', onKicked);
    };
  }, [roomId, playerId, playerName, navigate]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 👇 Исправлено: добавлен колбэк
  const startGame = () => {
    socket.emit('startGame', { roomId, playerId }, (res: any) => {
      if (!res?.success) alert(res?.error);
    });
  };

  // 👇 Исправлено: добавлен колбэк
  const leaveRoom = () => {
    socket.emit('leaveRoom', { roomId, playerId }, (res: any) => {
      navigate('/');
    });
  };

  // 👇 Исправлено: добавлен колбэк
  const kickPlayer = (targetId: string) => {
    if (!confirm('Точно кикнуть этого игрока?')) return;
    socket.emit('kickPlayer', { roomId, playerId, targetId }, (res: any) => {
      if (!res?.success) alert(res?.error);
    });
  };

  if (!room || isSyncing) {
    return <div className="min-h-screen flex items-center justify-center text-bunker-amber">Загрузка...</div>;
  }

  const me = room.players.find((p: any) => p.id === playerId);
  const isHost = me?.isHost;
  const placesLeft = room.maxPlayers - room.players.length;
  const canStart = room.players.length >= 2;

  return (
    <div className="min-h-screen pb-safe-nav">
      <header className="sticky-header px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-bunker-muted uppercase tracking-wider">Код комнаты</div>
          <div className="text-2xl font-mono font-black text-bunker-amber tracking-widest">{room.id}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={copyCode}>
            {copied ? '✅' : '📋'}
          </Button>
          <Button variant="danger" size="sm" onClick={leaveRoom}>
            🚪
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xs text-bunker-muted uppercase mb-1">Игроков</div>
            <div className="text-xl font-black text-bunker-amber">{room.players.length} / {room.maxPlayers}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-bunker-muted uppercase mb-1">🏚️ Мест</div>
            <div className="text-xl font-black text-bunker-green">{room.bunkerCapacity}</div>
          </Card>
        </div>

        <div className="space-y-2">
          {room.players.map((p: any) => (
            <div key={p.id} className={`card p-3 flex items-center gap-3 ${p.id === playerId ? 'border-bunker-amber/50' : ''}`}>
              <div className="text-2xl">{getAvatar(p.id)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{p.name}</span>
                  {p.id === playerId && <span className="badge bg-bunker-amber/20 text-bunker-amber border-bunker-amber/30">Вы</span>}
                  {p.isHost && <span className="badge bg-bunker-gold/20 text-bunker-gold border-bunker-gold/30">👑</span>}
                  {p.isObserver && <span className="badge bg-bunker-purple/20 text-bunker-purple border-bunker-purple/30">👁️</span>}
                </div>
              </div>
              
              {/* Кнопка кика */}
              {isHost && !p.isHost && (
                <button 
                  onClick={() => kickPlayer(p.id)}
                  className="text-bunker-red hover:text-red-400 p-2 text-lg"
                  title="Кикнуть"
                >
                  ✖️
                </button>
              )}
            </div>
          ))}

          {Array.from({ length: placesLeft }).map((_, i) => (
            <div key={i} className="bg-bunker-surface/40 border border-dashed border-bunker-border rounded-xl2 p-3 flex items-center gap-3 opacity-50">
              <div className="text-2xl grayscale">👤</div>
              <div className="text-sm text-bunker-muted italic">Ожидание игрока...</div>
            </div>
          ))}
        </div>

        <Button variant="ghost" fullWidth onClick={() => setChatOpen(true)}>
          💬 Открыть чат
        </Button>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-bunker-bg/95 border-t border-bunker-border backdrop-blur-md pb-[calc(12px+var(--safe-bottom))]">
        <div className="max-w-md mx-auto">
          {isHost ? (
            <Button onClick={startGame} disabled={!canStart} fullWidth size="lg">
              {canStart ? '🚀 Начать игру' : `⏳ Нужно ещё ${2 - room.players.length} игрока`}
            </Button>
          ) : (
            <div className="text-center text-bunker-muted py-3 text-sm bg-bunker-surface2 rounded-xl border border-bunker-border">
              ⏳ Ожидание хоста...
            </div>
          )}
        </div>
      </div>

      <BottomSheet open={chatOpen} onClose={() => setChatOpen(false)} title="💬 Чат комнаты">
        <Chat roomId={room.id} initialMessages={room.messages || []} />
      </BottomSheet>
    </div>
  );
};