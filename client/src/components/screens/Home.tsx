import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { socket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { BottomSheet } from '../ui/BottomSheet';

interface RoomListItem {
  id: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
}

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user, isGuest, logout } = useAuth();

  const [playerName, setPlayerName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [bunkerCapacity, setBunkerCapacity] = useState(2);
  const [isObserver, setIsObserver] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Стейты для BottomSheet'ов
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [roomsList, setRoomsList] = useState<RoomListItem[]>([]);
  
  // Стейты для Рейтинга
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Инициализация ID и загрузка имени
  useEffect(() => {
    if (!localStorage.getItem('bunker_playerId')) {
      localStorage.setItem('bunker_playerId', nanoid());
    }
    
    if (user) {
      setPlayerName(user.username);
      localStorage.setItem('bunker_playerName', user.username);
    } else {
      const savedName = localStorage.getItem('bunker_playerName');
      if (savedName) setPlayerName(savedName);
    }
  }, [user]);

  // Ограничение: мест в бункере всегда меньше, чем игроков
  useEffect(() => {
    if (bunkerCapacity >= maxPlayers) setBunkerCapacity(maxPlayers - 1);
  }, [maxPlayers, bunkerCapacity]);

  // Подключение к сокету и загрузка комнат
  useEffect(() => {
    socket.connect();
    
    const loadRooms = () => {
      socket.emit('getRoomsList', (res: any) => {
        if (res?.success) setRoomsList(res.rooms);
      });
    };

    loadRooms();
    socket.on('roomsListUpdated', setRoomsList);
    const interval = setInterval(loadRooms, 5000);

    return () => {
      socket.off('roomsListUpdated');
      clearInterval(interval);
    };
  }, []);

  // Загрузка таблицы лидеров
  const loadLeaderboard = async () => {
    try {
      const data = await api.get('/leaderboard');
      if (data.success) setLeaderboard(data.leaderboard);
    } catch (e) {
      console.error('Ошибка загрузки рейтинга', e);
    }
  };

  const runWithSocket = (event: string, payload: any, done: (res: any) => void) => {
    setIsLoading(true);
    setError('');
    socket.connect();

    const send = () => {
      socket.timeout(8000).emit(event, payload, (err: any, response: any) => {
        setIsLoading(false);
        if (err || !response) return setError('Сервер не отвечает. Проверьте соединение.');
        done(response);
      });
    };

    if (socket.connected) send();
    else socket.once('connect', send);
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) return setError('Введите имя');
    
    const playerId = localStorage.getItem('bunker_playerId')!;
    localStorage.setItem('bunker_playerName', playerName.trim());

    runWithSocket(
      'createRoom',
      { playerId, playerName: playerName.trim(), maxPlayers, bunkerCapacity, isObserver, userId: user?.id },
      (res) => {
        if (res.success) navigate(`/lobby/${res.roomId}`, { state: { room: res.room } });
        else setError(res.error);
      }
    );
  };

  const handleJoinRoom = (code: string) => {
    if (!playerName.trim()) return setError('Введите имя перед входом');
    
    const roomId = code.trim().toUpperCase();
    if (roomId.length !== 6) return setError('Код должен быть из 6 символов');

    const playerId = localStorage.getItem('bunker_playerId')!;
    localStorage.setItem('bunker_playerName', playerName.trim());

    runWithSocket(
      'joinRoom',
      { playerId, playerName: playerName.trim(), roomId, userId: user?.id },
      (res) => {
        if (res.success) navigate(`/lobby/${roomId}`, { state: { room: res.room } });
        else setError(res.error);
      }
    );
  };

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center">
      
      <div className="text-center mb-8">
        <h1 className="text-5xl font-black text-amber-glow mb-1 tracking-tight">БУНКЕР</h1>
        <p className="text-bunker-muted text-xs uppercase tracking-widest font-mono">
          Warm Fallout Edition
        </p>
      </div>

      {error && (
        <div className="bg-bunker-red/10 border border-bunker-red text-bunker-red px-4 py-3 rounded-xl text-sm text-center mb-4 animate-fade-in">
          {error}
        </div>
      )}

      <Card className="p-4 space-y-5 mb-6">
        <Input 
          label="Ваше имя" 
          placeholder="Выживший_77"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
          disabled={!!user}
          className={!!user ? "opacity-70 cursor-not-allowed" : ""}
        />

        {/* Блок статистики для залогиненных */}
        {user && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-bunker-bg/50 p-2 rounded-lg border border-bunker-border text-center">
              <div className="text-[10px] text-bunker-muted uppercase">Сыграно</div>
              <div className="font-bold text-bunker-text">{user.gamesPlayed}</div>
            </div>
            <div className="bg-bunker-bg/50 p-2 rounded-lg border border-bunker-border text-center">
              <div className="text-[10px] text-bunker-muted uppercase">Побед</div>
              <div className="font-bold text-bunker-green">{user.gamesWon}</div>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Слайдер игроков */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-bunker-muted">Игроков</span>
              <span className="text-xl font-black text-bunker-amber">{maxPlayers}</span>
            </div>
            <input 
              type="range" min={2} max={16} value={maxPlayers} 
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-bunker-border accent-bunker-amber" 
            />
          </div>

          {/* Слайдер бункера */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-bunker-muted">🏚️ Мест в бункере</span>
              <span className="text-xl font-black text-bunker-green">{bunkerCapacity}</span>
            </div>
            <input 
              type="range" min={1} max={maxPlayers - 1} value={bunkerCapacity} 
              onChange={(e) => setBunkerCapacity(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-bunker-border accent-bunker-green" 
            />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer bg-bunker-surface2 border border-bunker-border rounded-xl p-3">
          <input 
            type="checkbox" 
            checked={isObserver} 
            onChange={(e) => setIsObserver(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-bunker-amber cursor-pointer" 
          />
          <div>
            <div className="text-sm font-bold text-bunker-text">👁️ Режим наблюдателя</div>
            <div className="text-xs text-bunker-muted mt-0.5">Управлять игрой, но не участвовать.</div>
          </div>
        </label>

        <Button onClick={handleCreateRoom} loading={isLoading} fullWidth size="lg">
          🚀 Создать комнату
        </Button>
      </Card>

      {/* 3 кнопки: Код, Комнаты, Топ */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" onClick={() => setJoinOpen(true)} size="sm">
          🔑 Код
        </Button>
        <Button variant="ghost" onClick={() => setRoomsOpen(true)} size="sm">
          🌐 Комнаты
        </Button>
        <Button variant="ghost" onClick={() => { setLeaderboardOpen(true); loadLeaderboard(); }} size="sm">
          🏆 Топ
        </Button>
      </div>

      {/* Кнопка выхода */}
      <div className="mt-8 text-center pb-4">
        <button 
          onClick={logout} 
          className="text-xs text-bunker-muted hover:text-bunker-red transition-colors border-b border-transparent hover:border-bunker-red pb-0.5"
        >
          {user ? `Выйти из аккаунта (${user.username})` : 'Выйти из режима гостя'}
        </button>
      </div>

      {/* BottomSheet: Вход по коду */}
      <BottomSheet open={joinOpen} onClose={() => setJoinOpen(false)} title="🔑 Вход по коду">
        <div className="space-y-4">
          <Input 
            placeholder="ABC123"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            className="text-center tracking-[0.5em] text-2xl font-mono"
          />
          <Button 
            variant="primary" fullWidth size="lg" 
            onClick={() => handleJoinRoom(joinCode)}
            disabled={joinCode.length !== 6}
            loading={isLoading}
          >
            Войти
          </Button>
        </div>
      </BottomSheet>

      {/* BottomSheet: Список комнат */}
      <BottomSheet open={roomsOpen} onClose={() => setRoomsOpen(false)} title="🌐 Активные комнаты">
        {roomsList.length === 0 ? (
          <div className="text-center text-bunker-muted py-8">Пока нет комнат</div>
        ) : (
          <div className="space-y-2">
            {roomsList.map((r) => (
              <div key={r.id} className="bg-bunker-surface2 p-3 rounded-xl border border-bunker-border flex justify-between items-center">
                <div>
                  <div className="font-mono text-lg font-bold text-bunker-amber">{r.id}</div>
                  <div className="text-xs text-bunker-muted">👑 {r.hostName} • {r.playerCount}/{r.maxPlayers} игроков</div>
                </div>
                <Button 
                  variant="ghost" size="sm" 
                  onClick={() => { setRoomsOpen(false); handleJoinRoom(r.id); }}
                  disabled={r.status !== 'lobby' || r.playerCount >= r.maxPlayers}
                >
                  Войти
                </Button>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* BottomSheet: Рейтинг */}
      <BottomSheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} title="🏆 Таблица лидеров">
        {leaderboard.length === 0 ? (
          <div className="text-center text-bunker-muted py-8">Пока нет данных. Сыграйте первую игру!</div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((u, i) => {
              const isMe = user?.username === u.username;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
              
              return (
                <div 
                  key={u.username} 
                  className={`flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-bunker-amber/10 border-bunker-amber' : 'bg-bunker-surface2 border-bunker-border'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-black text-lg w-6 text-center ${i < 3 ? 'text-2xl' : 'text-bunker-muted'}`}>
                      {medal}
                    </span>
                    <div>
                      <div className={`font-bold text-sm ${isMe ? 'text-bunker-amber' : 'text-bunker-text'}`}>
                        {u.username} {isMe && '(Вы)'}
                      </div>
                      <div className="text-[10px] text-bunker-muted">
                        Сыграно игр: {u.gamesPlayed}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-bunker-green">{u.gamesWon} <span className="text-xs">побед</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};