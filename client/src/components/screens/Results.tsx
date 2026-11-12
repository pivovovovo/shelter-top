import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { sounds } from '../../lib/sounds';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const AVATARS = ['🧑‍🚀', '👨‍🔬', '👩‍⚕️', '🧙', '👨‍🍳', '👩‍🎨', '🕵️', '🧑‍🌾', '👨‍✈️', '👩‍🚒'];
const getAvatar = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(hash) % AVATARS.length];
};

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

export const Results: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => {
    socket.connect();
    
    // Функция проверки статуса и редиректа
    const checkStatusAndRedirect = (r: any) => {
      if (r.status === 'discussion') navigate(`/game/${roomId}`);
      if (r.status === 'voting') navigate(`/voting/${roomId}`);
      if (r.status === 'lobby') navigate(`/lobby/${roomId}`);
    };

    socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (res: any) => {
      if (res?.success) {
        // Если мы зашли на /results, но на сервере уже игра — сразу кидаем на игру
        if (res.room.status !== 'results' && res.room.status !== 'finished') {
          checkStatusAndRedirect(res.room);
        } else {
          setRoom(res.room);
        }
      } else navigate('/');
    });

    const onUpdate = (r: any) => {
      // Если статус изменился (например, хост начал новый раунд) — перекидываем
      if (r.status !== 'results' && r.status !== 'finished') {
        checkStatusAndRedirect(r);
        return; // Не обновляем стейт, мы уходим
      }
      
      setRoom(r);
      if (r.lastVotingResult?.excludedPlayerId && r.lastVotingResult.excludedPlayerId !== room?.lastVotingResult?.excludedPlayerId) {
        sounds.boom();
      }
    };

    socket.on('roomUpdated', onUpdate);
    return () => { socket.off('roomUpdated', onUpdate); };
  }, [roomId, playerId, playerName, navigate, room?.lastVotingResult?.excludedPlayerId]);

  const handleNextRound = () => {
    if (loading) return; // Защита от дабл-клика
    setLoading('next');
    socket.emit('nextRound', { roomId, playerId }, (res: any) => {
      setLoading(null);
      if (!res?.success) {
        // Если пришла ошибка — перезапрашиваем комнату (вдруг мы уже в игре)
        socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (syncRes: any) => {
          if (syncRes?.success) {
            if (syncRes.room.status === 'discussion') navigate(`/game/${roomId}`);
            else if (syncRes.room.status === 'voting') navigate(`/voting/${roomId}`);
            else alert(res?.error || 'Ошибка');
          }
        });
      }
    });
  };

  const handleRevealAll = () => {
    setLoading('reveal');
    socket.emit('revealAll', { roomId, playerId }, (res: any) => {
      setLoading(null);
      if (!res?.success) alert(res?.error);
    });
  };

  const handleRestart = () => {
    setLoading('restart');
    socket.emit('restartGame', { roomId, playerId }, (res: any) => {
      setLoading(null);
      if (!res?.success) {
        alert(res?.error);
        socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (syncRes: any) => {
          if (syncRes?.success && syncRes.room.status === 'lobby') navigate(`/lobby/${roomId}`);
        });
      }
    });
  };

  const goHome = async () => {
    await refreshUser();
    navigate('/');
  };

  if (!room) return <div className="min-h-screen flex items-center justify-center text-bunker-amber">Загрузка...</div>;

  const me = room.players.find((p: any) => p.id === playerId);
  const isCreator = room.creatorId === playerId || room.players[0]?.id === playerId;
  const canControl = me?.isHost || isCreator;

  const alivePlayers = room.players.filter((p: any) => p.isAlive);
  const finished = alivePlayers.length <= room.bunkerCapacity;
  const excludedId = room.lastVotingResult?.excludedPlayerId;
  const excludedPlayer = room.players.find((p: any) => p.id === excludedId);
  const voteCounts = room.lastVotingResult?.voteCounts || {};

  if (finished) {
    return (
      <div className="min-h-screen bg-bunker-bg p-4 max-w-md mx-auto flex flex-col">
        <div className="text-center mb-6 mt-4">
          <h1 className="text-3xl font-black text-amber-glow mb-1">Игра окончена</h1>
          <p className="text-sm text-bunker-muted">Бункер заполнен</p>
        </div>

        <Card className="p-5 text-center mb-6 border-2 border-bunker-gold bg-bunker-gold/5">
          <div className="text-5xl mb-3">🏆</div>
          <h2 className="text-xl font-bold text-bunker-gold mb-3">ВЫЖИВШИЕ</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {alivePlayers.map((p: any) => (
              <div key={p.id} className="bg-bunker-surface2 px-3 py-1.5 rounded-full border border-bunker-border flex items-center gap-1.5">
                <span>{getAvatar(p.id)}</span>
                <span className="text-sm font-bold text-bunker-text">{p.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {!room.allRevealed && canControl && (
          <Button onClick={handleRevealAll} loading={loading === 'reveal'} variant="primary" fullWidth size="lg" className="mb-6">
            🔓 Раскрыть все карты
          </Button>
        )}
        {!room.allRevealed && !canControl && (
          <div className="text-center text-bunker-muted py-3 text-sm bg-bunker-surface2 rounded-xl border border-bunker-border mb-6">⏳ Ожидание хоста...</div>
        )}

        {room.allRevealed && (
          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-bold text-bunker-muted uppercase px-1">Все персонажи</h3>
            {room.players.map((p: any) => (
              <Card key={p.id} className={`p-4 border-2 ${p.isAlive ? 'border-bunker-green/30' : 'border-bunker-border opacity-70'}`}>
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-bunker-border">
                  <span className="text-2xl">{getAvatar(p.id)}</span>
                  <span className="font-bold text-bunker-text flex-1">{p.name}</span>
                  {p.isAlive ? <span className="badge bg-bunker-green/20 text-bunker-green border-bunker-green/30">✅ Выжил</span> : <span className="badge bg-bunker-red/20 text-bunker-red border-bunker-red/30">☠️ Исключён</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {fieldsConfig.map(({ key, label, icon }) => {
                    const val = p.card?.[key];
                    const val2 = p.card?.[`${key}2`];
                    return (
                      <div key={key} className="bg-bunker-surface2 p-2 rounded-lg text-xs">
                        <div className="text-[10px] text-bunker-muted uppercase mb-0.5">{icon} {label}</div>
                        <div className="text-bunker-text font-medium">
                          {Array.isArray(val) ? val.join(', ') : val || '???'}
                          {val2 && <span className="text-bunker-green"> + {Array.isArray(val2) ? val2.join(', ') : val2}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-auto pb-8 space-y-3">
          {canControl && (
            <Button variant="success" fullWidth size="lg" onClick={handleRestart} loading={loading === 'restart'}>
              🔄 Новая игра
            </Button>
          )}
          <Button variant="ghost" fullWidth size="lg" onClick={goHome}>🏠 В главное меню</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bunker-bg p-4 max-w-md mx-auto flex flex-col">
      <div className="text-center mb-6 mt-4">
        <h1 className="text-3xl font-black text-amber-glow mb-1">Результаты</h1>
        <p className="text-sm text-bunker-muted">Раунд {room.currentRound} • Статус: {room.status}</p>
      </div>

      <Card className="p-5 text-center mb-6 border-2 border-bunker-red bg-bunker-red/5">
        <div className="text-5xl mb-3">☠️</div>
        <h2 className="text-xl font-bold mb-2">{excludedPlayer ? `${excludedPlayer.name} покидает бункер` : 'Ничья — никто не исключён'}</h2>
      </Card>

      <div className="space-y-2 mb-6">
        <h3 className="text-xs font-bold text-bunker-muted uppercase px-1">Голоса</h3>
        {room.players.map((p: any) => {
          const count = voteCounts[p.id] || 0;
          return (
            <div key={p.id} className="flex justify-between items-center bg-bunker-surface2 p-3 rounded-xl border border-bunker-border">
              <span className="text-sm font-bold">{p.name}</span>
              <span className={`font-black ${count > 0 ? 'text-bunker-red' : 'text-bunker-muted'}`}>{count}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto space-y-3 pb-8">
        {canControl && room.status === 'results' ? (
          <Button variant="primary" fullWidth size="lg" onClick={handleNextRound} loading={loading === 'next'}>
            ⏭️ Следующий раунд ({room.currentRound + 1})
          </Button>
        ) : !canControl ? (
          <div className="text-center text-bunker-muted py-3 text-sm bg-bunker-surface2 rounded-xl border border-bunker-border">Ожидание хоста...</div>
        ) : null}
      </div>
    </div>
  );
};