import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { sounds } from '../../lib/sounds';

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
  { key: 'fact', label: 'Факт', icon: '💡' }, // 👈
] as const;

export const Voting: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [voted, setVoted] = useState(false);
  const [myTarget, setMyTarget] = useState<string | null>(null);

  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => {
    socket.connect();
    socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (res: any) => {
      if (res?.success) {
        setRoom(res.room);
        const myVote = res.room.votes?.find((v: any) => v.voterId === playerId);
        if (myVote) { setVoted(true); setMyTarget(myVote.targetId); }
      } else navigate('/');
    });

    const onUpdate = (r: any) => {
      setRoom(r);
      if (r.status === 'results' || r.status === 'finished') navigate(`/results/${roomId}`);
    };
    const onVoteUpdated = (data: { votes: any[] }) => {
      setRoom((prev: any) => (prev ? { ...prev, votes: data.votes } : null));
    };

    socket.on('roomUpdated', onUpdate);
    socket.on('voteUpdated', onVoteUpdated);
    return () => { socket.off('roomUpdated', onUpdate); socket.off('voteUpdated', onVoteUpdated); };
  }, [roomId, playerId, playerName, navigate]);

  if (!room) return <div className="min-h-screen flex items-center justify-center text-bunker-amber">Загрузка...</div>;

  const me = room.players.find((p: any) => p.id === playerId);
  const isHost = me?.isHost;
  const isObserver = me?.isObserver;
  const alivePlayers = room.players.filter((p: any) => p.isAlive && !p.isObserver);
  const votes = room.votes || [];
  const votedCount = votes.length;
  const allVoted = votedCount >= alivePlayers.length;

  const getVotes = (targetId: string) => {
    let count = 0;
    votes.forEach((v: any) => { if (v.targetId === targetId) count++; });
    const target = room.players.find((p: any) => p.id === targetId);
    return count + (target?.hostBonusVotes || 0);
  };

  const handleVote = (targetId: string) => {
    if (voted) return;
    setVoted(true);
    setMyTarget(targetId);
    sounds.vote();
    socket.emit('vote', { roomId, playerId, targetPlayerId: targetId }, (res: any) => {
      if (!res?.success) { setVoted(false); setMyTarget(null); sounds.error(); alert(res?.error); }
    });
  };

  const handleEditVote = (targetId: string, delta: number) => {
    socket.emit('editVoteCount', { roomId, playerId, targetId, delta }, (res: any) => {
      if (!res?.success) alert(res?.error || 'Ошибка');
    });
  };

  const handleRemoveVote = (voterId: string) => {
    if (!confirm('Удалить голос?')) return;
    socket.emit('removePlayerVote', { roomId, playerId, voterId }, (res: any) => {
      if (!res?.success) alert(res?.error || 'Ошибка');
    });
  };

  const handleConfirm = () => {
    socket.emit('confirmExclusion', { roomId, playerId }, (res: any) => {
      if (!res?.success) alert(res?.error);
    });
  };

  const handleFinishEarly = () => {
    socket.emit('finishVoting', { roomId }, (res: any) => {
      if (!res?.success) alert(res?.error);
    });
  };

  return (
    <div className="min-h-screen bg-bunker-bg pb-24">
      <header className="sticky-header px-4 py-3">
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-xs text-bunker-muted uppercase">Раунд {room.currentRound}</div>
            <div className="text-lg font-bold text-bunker-amber">Голосование</div>
          </div>
          <div className="text-sm font-bold text-bunker-text">{votedCount} / {alivePlayers.length}</div>
        </div>
        <div className="w-full bg-bunker-surface2 h-2 rounded-full overflow-hidden">
          <div className="bg-bunker-amber h-full transition-all" style={{ width: `${(votedCount / alivePlayers.length) * 100}%` }} />
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto space-y-3">
        {[...alivePlayers]
          .sort((a: any, b: any) => (a.id === playerId ? -1 : b.id === playerId ? 1 : 0))
          .map((p: any) => {
            const isMe = p.id === playerId;
            const vCount = getVotes(p.id);
            const isSelected = myTarget === p.id;
            
            return (
              <Card key={p.id} className={`p-3 border-2 ${isSelected ? 'border-bunker-green' : 'border-bunker-border'}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-sm text-bunker-text">{p.name} {isMe && '(Вы)'}</div>
                  <div className="text-lg font-black text-bunker-amber">{vCount} <span className="text-xs text-bunker-muted">гол.</span></div>
                </div>

                {!isObserver && !isMe && p.isAlive && (
                  isSelected ? (
                    <div className="text-center text-bunker-green text-sm font-bold bg-bunker-green/10 py-2 rounded-lg">✓ Ваш голос</div>
                  ) : (
                    <Button variant="danger" size="sm" fullWidth disabled={voted} onClick={() => handleVote(p.id)}>Голосовать</Button>
                  )
                )}

                {isHost && !isMe && p.isAlive && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-bunker-border/50">
                    <span className="text-xs text-bunker-muted">Бонус хоста:</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEditVote(p.id, -1)} className="w-8 h-8 bg-bunker-surface2 rounded text-bunker-red font-bold">-</button>
                      <span className="text-sm font-bold text-bunker-text w-4 text-center">{p.hostBonusVotes || 0}</span>
                      <button onClick={() => handleEditVote(p.id, 1)} className="w-8 h-8 bg-bunker-surface2 rounded text-bunker-green font-bold">+</button>
                    </div>
                  </div>
                )}
              </Card>
            );
        })}
      </main>

      {isHost && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-bunker-bg/95 border-t border-bunker-border pb-[calc(16px+var(--safe-bottom))]">
          {allVoted ? (
            <Button variant="primary" fullWidth size="lg" onClick={handleConfirm} className="animate-pulse">✅ Подтвердить исключение</Button>
          ) : (
            <Button variant="ghost" fullWidth size="lg" onClick={handleFinishEarly}>⏹️ Завершить досрочно</Button>
          )}
        </div>
      )}
      
      {!isHost && allVoted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-bunker-amber/90 text-bunker-bg font-bold text-center pb-[calc(16px+var(--safe-bottom))]">
          ⏳ Ожидание хоста...
        </div>
      )}
    </div>
  );
};