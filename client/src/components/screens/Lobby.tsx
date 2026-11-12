import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth(); // 👈 Берем юзера для синхронизации

  const [room, setRoom] = useState<any>(location.state?.room || null);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => {
    socket.connect();
    
    // Принудительная синхронизация при заходе (важно для рестарта игры и F5)
    if (roomId && playerId) {
      setIsSyncing(true);
      socket.emit('syncRoom', { 
        roomId, 
        playerId, 
        playerName, 
        isHost: false,
        userId: user?.id // 👈 передаем userId
      }, (res: any) => {
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
  }, [roomId, playerId, playerName, navigate, user?.id]);
  // Универсальная функция копирования (работает на HTTP и HTTPS)
  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      // 1. Пробуем современный API (только для HTTPS/localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        alert(successMsg);
        return true;
      }

      // 2. Fallback для HTTP — через временный textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.top = '0';
      textarea.style.left = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        alert(successMsg);
        return true;
      }
      throw new Error('execCommand failed');
    } catch (err) {
      // 3. Крайний случай — показываем ссылку, чтобы скопировали вручную
      prompt('Не удалось скопировать автоматически. Скопируйте вручную:', text);
      return false;
    }
  };

  const copyCode = async () => {
    const ok = await copyToClipboard(roomId || '', 'Код комнаты скопирован!');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyBoardLink = async () => {
    const boardUrl = `${window.location.origin}/board/${roomId}`;
    await copyToClipboard(
      boardUrl,
      `📺 Ссылка на ЭКРАН ВЕДУЩЕГО скопирована!\n\n${boardUrl}\n\nОткройте её на ПК или телевизоре.`
    );
  };

  // 👇 Все emit с колбэками
  const startGame = () => {
    socket.emit('startGame', { roomId, playerId }, (res: any) => {
      if (!res?.success) alert(res?.error);
    });
  };

  const leaveRoom = () => {
    socket.emit('leaveRoom', { roomId, playerId }, () => {
      navigate('/');
    });
  };

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
  const isCreator = room.creatorId === playerId || room.players[0]?.id === playerId;
  const isHost = me?.isHost || isCreator;
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
          <Button variant="ghost" size="sm" onClick={copyCode} title="Скопировать код">
            {copied ? '✅' : '📋'}
          </Button>
          <Button variant="ghost" size="sm" onClick={copyBoardLink} title="Ссылка на Экран Ведущего">
            📺
          </Button>
          <Button variant="danger" size="sm" onClick={leaveRoom} title="Выйти">
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

        {/* Плашка с паролем, если он есть */}
        {room.password && (
          <div className="bg-bunker-gold/10 border border-bunker-gold/30 rounded-xl p-2 text-center text-xs text-bunker-gold">
            🔒 Комната защищена паролем
          </div>
        )}

        <div className="space-y-2">
          {room.players.map((p: any) => (
            <div key={p.id} className={`card p-3 flex items-center gap-3 ${p.id === playerId ? 'border-bunker-amber/50' : ''}`}>
              <div className="text-2xl">{getAvatar(p.id)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{p.name}</span>
                  {p.id === playerId && <span className="badge bg-bunker-amber/20 text-bunker-amber border-bunker-amber/30">Вы</span>}
                  {p.isHost && <span className="badge bg-bunker-gold/20 text-bunker-gold border-bunker-gold/30">👑</span>}
                </div>
              </div>
              
              {/* Кнопка кика (только для хоста) */}
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