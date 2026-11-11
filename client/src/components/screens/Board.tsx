import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../../lib/socket';

const fieldsConfig = [
  { key: 'profession', label: 'Профессия', icon: '💼' },
  { key: 'gender', label: 'Пол', icon: '👤' },
  { key: 'age', label: 'Возраст', icon: '🎂' },
  { key: 'health', label: 'Здоровье', icon: '❤️' },
  { key: 'badHabit', label: 'Привычки', icon: '🚬' },
  { key: 'hobby', label: 'Хобби', icon: '🛠️' },
  { key: 'luggage', label: 'Багаж', icon: '🎒' },
  { key: 'phobia', label: 'Фобия', icon: '😨' },
  { key: 'specialInfo', label: 'Доп. инфо', icon: '🤫' },
  { key: 'fact', label: 'Факт', icon: '💡' },
] as const;

export const Board: React.FC = () => {
  const { roomId } = useParams();
  const [room, setRoom] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    socket.connect();
    
    const onUpdate = (r: any) => { if (r.id === roomId) setRoom(r); };
    socket.on('roomUpdated', onUpdate);

    return () => { socket.off('roomUpdated', onUpdate); };
  }, [roomId]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    socket.emit('joinBoard', { roomId, password }, (res: any) => {
      if (res?.success) { setRoom(res.room); setError(''); }
      else setError(res?.error || 'Ошибка');
    });
  };

  // Экран ввода пароля для большого экрана
  if (!room) {
    return (
      <div className="min-h-screen bg-bunker-bg flex items-center justify-center p-4">
        <form onSubmit={handleJoin} className="card p-6 w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-black text-amber-glow text-center">ЭКРАН ВЕДУЩЕГО</h1>
          <p className="text-center text-sm text-bunker-muted">Комната: {roomId}</p>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <input 
            type="password" 
            placeholder="Пароль комнаты (если есть)" 
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-bunker-surface2 border border-bunker-border rounded-xl px-4 py-3 text-white outline-none focus:border-bunker-amber"
          />
          <button type="submit" className="btn-primary w-full">Подключиться</button>
        </form>
      </div>
    );
  }

  // Сам экран вещания
  return (
    <div className="min-h-screen bg-bunker-bg bg-grid p-6 text-bunker-text overflow-hidden">
      {/* Шапка */}
      <div className="flex justify-between items-end mb-6 border-b border-bunker-border pb-4">
        <div>
          <h1 className="text-4xl font-black text-amber-glow tracking-wider">БУНКЕР</h1>
          <p className="text-bunker-muted uppercase tracking-widest mt-1">Экран ведущего</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-bunker-amber">Раунд {room.currentRound}</div>
          <div className="text-lg text-bunker-red font-bold">{room.catastrophe?.name}</div>
        </div>
      </div>

      {/* Сетка игроков */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {room.players.map((p: any) => (
          <div key={p.id} className={`card p-3 border-2 ${!p.isAlive ? 'border-bunker-red/50 opacity-50' : room.currentSpeaker === p.id ? 'border-bunker-amber animate-pulse' : 'border-bunker-border'}`}>
            <div className="flex items-center justify-between mb-2 border-b border-bunker-border/50 pb-2">
              <span className="font-black text-lg truncate pr-2">{p.name}</span>
              <div className="flex gap-1">
                {p.isHost && <span className="text-sm">👑</span>}
                {!p.isAlive && <span className="text-sm">☠️</span>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              {fieldsConfig.map(f => {
                const isRevealed = p.revealedFields?.includes(f.key);
                if (!isRevealed) return null; // Показываем ТОЛЬКО раскрытые поля
                
                const val = p.card?.[f.key];
                const val2 = p.card?.[`${f.key}2`];
                return (
                  <div key={f.key} className="bg-bunker-surface2 p-1.5 rounded text-xs">
                    <div className="text-[9px] text-bunker-muted uppercase">{f.icon} {f.label}</div>
                    <div className="text-bunker-text truncate" title={val}>
                      {Array.isArray(val) ? val.join(', ') : val}
                      {val2 && <span className="text-bunker-green ml-1">+ {Array.isArray(val2) ? val2.join(', ') : val2}</span>}
                    </div>
                  </div>
                );
              })}
              {p.revealedFields?.length === 0 && (
                <div className="col-span-2 text-center text-bunker-muted text-xs italic py-2">Ничего не раскрыто</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};