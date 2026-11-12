import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Collapsible } from '../ui/Collapsible';
import { BottomNav, NavTab } from '../ui/BottomNav';
import { Chat } from '../Chat';
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
  { key: 'fact', label: 'Факт', icon: '💡' },
] as const;

const JOKER_OPTIONS = [
  { type: 'swap', name: 'Обмен', emoji: '🔁' }, { type: 'reveal', name: 'Вскрытие', emoji: '👁️' },
  { type: 'shield', name: 'Защита', emoji: '🛡️' }, { type: 'panic', name: 'Паника', emoji: '😱' },
  { type: 'mutation', name: 'Мутация', emoji: '🧬' }, { type: 'immunity', name: 'Иммунитет', emoji: '🛡️' },
  { type: 'doubleVote', name: 'Двойной голос', emoji: '🗳️' }, { type: 'scholar', name: 'Учёный', emoji: '🎓' },
];

export const Game: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState<any>(null);
  const [myCard, setMyCard] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('players');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false); // простая блокировка
  
  const [jokerCardIndex, setJokerCardIndex] = useState<number | null>(null);
  const [revealFieldByCard, setRevealFieldByCard] = useState<Record<number, string>>({});
  const [referendumTarget, setReferendumTarget] = useState('');
  const [mutationCardIndex, setMutationCardIndex] = useState<number | null>(null);
  const [mutationField, setMutationField] = useState<string | null>(null);

  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => {
    socket.connect();
    socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (res: any) => {
      if (res?.success) {
        setRoom(res.room);
        socket.emit('getMyCard', { roomId, playerId }, (c: any) => { if (c?.success) setMyCard(c.card); });
      } else { navigate('/'); }
    });

    const onRoomUpdated = (r: any) => {
      setRoom(r);
      const updatedMe = r.players.find((p: any) => p.id === playerId);
      if (updatedMe?.card) setMyCard(updatedMe.card);
      if (r.status === 'voting') navigate(`/voting/${roomId}`);
      if (r.status === 'results') navigate(`/results/${roomId}`);
      if (r.status === 'lobby') navigate(`/lobby/${roomId}`);
    };

    socket.on('roomUpdated', onRoomUpdated);
    return () => { socket.off('roomUpdated', onRoomUpdated); };
  }, [roomId, playerId, playerName, navigate]);

  if (!room) return <div className="min-h-screen flex items-center justify-center text-bunker-amber">Загрузка...</div>;

  const me = room.players.find((p: any) => p.id === playerId);
  const isCreator = room.creatorId === playerId || room.players[0]?.id === playerId;
  const isHost = me?.isHost || isCreator;
  const canControl = isHost || isCreator;
  const usedThisRound = me?.revealedThisRound?.length || 0;
  const baseLimit = room.currentRound <= 2 ? 2 : 1;
  const roundLimit = me?.hasScholar ? baseLimit + 1 : baseLimit;
  const speaker = room.players.find((p: any) => p.id === room.currentSpeaker);
  const isMyTurn = room.currentSpeaker === playerId;

  const handleReveal = (field: string) => {
    if (isRevealing) return;
    setIsRevealing(true);
    sounds.reveal();
    
    socket.emit('revealCard', { roomId, playerId, field }, (res: any) => {
      // Сбрасываем блокировку через 300мс
      setTimeout(() => setIsRevealing(false), 300);
      
      if (!res?.success) {
        alert(res?.error || 'Ошибка раскрытия');
        // Форс-синхронизация
        socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (syncRes: any) => {
          if (syncRes?.success) setRoom(syncRes.room);
        });
      }
    });
  };

  const emitAction = (ev: string) => {
    socket.emit(ev, { roomId, playerId }, (res: any) => {
      if (!res?.success) {
        socket.emit('syncRoom', { roomId, playerId, playerName, isHost: false }, (syncRes: any) => {
          if (syncRes?.success) {
            setRoom(syncRes.room);
            if (syncRes.room.status === 'voting') navigate(`/voting/${roomId}`);
            if (syncRes.room.status === 'results') navigate(`/results/${roomId}`);
            if (syncRes.room.status === 'lobby') navigate(`/lobby/${roomId}`);
          }
        });
        alert(res?.error || 'Ошибка');
      }
    });
  };

  const tabs: NavTab[] = [
    { id: 'players', label: 'Игроки', icon: '👥' },
    { id: 'cards', label: 'Карты', icon: '🎴', badge: (me?.actionCards || []).filter((c: any) => !c.used).length },
    { id: 'bunker', label: 'Бункер', icon: '🏚️' },
    { id: 'chat', label: 'Чат', icon: '💬' },
  ];

  const renderPlayers = () => (
    <div className="space-y-3">
      {/* Индикатор хода */}
      {isMyTurn ? (
        <div className="bg-bunker-amber/10 border-2 border-bunker-amber/50 rounded-xl p-3 text-center">
          <div className="text-lg font-black text-bunker-amber">🎤 ВАШ ХОД</div>
          <div className="text-xs text-bunker-text mt-1">
            Раскрыто: {usedThisRound} / {roundLimit}
          </div>
        </div>
      ) : speaker ? (
        <div className="bg-bunker-surface2 border border-bunker-border rounded-xl p-3 text-center">
          <div className="text-sm text-bunker-muted">Сейчас говорит</div>
          <div className="font-bold text-bunker-amber">{speaker.name}</div>
        </div>
      ) : null}

      {canControl && (
        <div className="mb-4">
          <Button variant="danger" size="sm" fullWidth onClick={() => emitAction('startVoting')}>
            🗳️ Завершить обсуждение и начать голосование
          </Button>
        </div>
      )}

      {[...room.players]
        .sort((a: any, b: any) => (a.id === playerId ? -1 : b.id === playerId ? 1 : 0))
        .map((p: any) => {
          const isMe = p.id === playerId;
          const isExpanded = expandedPlayer === p.id || isMe;
          
          return (
            <Card key={p.id} className={`overflow-hidden border-2 ${isMe ? 'border-bunker-amber/50' : 'border-bunker-border'}`}>
              <button onClick={() => setExpandedPlayer(isExpanded && !isMe ? null : p.id)} className="w-full p-3 flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{p.name}</span>
                  {isMe && <span className="badge bg-bunker-amber/20 text-bunker-amber border-bunker-amber/30">Вы</span>}
                  {p.isHost && <span className="text-sm">👑</span>}
                  {room.currentSpeaker === p.id && <span className="text-sm">🎤</span>}
                </div>
                {!isMe && <span className="text-bunker-muted">{isExpanded ? '▲' : '▼'}</span>}
              </button>
              
              {isExpanded && (
                <div className="p-3 pt-0 border-t border-bunker-border/50 grid grid-cols-2 gap-2">
                  {fieldsConfig.map(({ key, label, icon }) => {
                    const revealed = p.revealedFields?.includes(key);
                    // 👇 Кнопка показывается, если это я и есть место в лимите (ход не важен)
                    const canReveal = isMe && usedThisRound < roundLimit && !revealed && !isRevealing;
                    const val = isMe ? myCard?.[key] : p.card?.[key];
                    const val2 = isMe ? myCard?.[`${key}2`] : p.card?.[`${key}2`];

                    return (
                      <div key={key} className="bg-bunker-surface2 p-2 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-bunker-muted uppercase">{icon} {label}</span>
                          {canReveal && (
                            <button 
                              onClick={() => handleReveal(key)} 
                              className="text-xs bg-bunker-amber text-black px-1.5 py-0.5 rounded"
                            >
                              👁️
                            </button>
                          )}
                          {revealed && <span className="text-bunker-green text-[10px]">✓</span>}
                        </div>
                        <div className={`text-xs ${revealed || isMe ? 'text-bunker-text' : 'text-bunker-muted'}`}>
                          {(revealed || isMe) ? (Array.isArray(val) ? val.join(', ') : val || '???') : '???'}
                          {(revealed || isMe) && val2 && <span className="text-bunker-green"> + {Array.isArray(val2) ? val2.join(', ') : val2}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
      })}
    </div>
  );

  const renderCards = () => {
    const myCards = me?.actionCards || [];
    const activeCardsCount = myCards.filter((c: any) => !c.used).length;
    if (activeCardsCount === 0) return <div className="text-center text-bunker-muted py-8"><div className="text-4xl mb-2">🎴</div><div className="text-sm">Нет активных карт</div></div>;

    return (
      <div className="space-y-3">
        {myCards.map((card: any, idx: number) => {
          if (card.used) return null;
          return (
            <Card key={idx} className={`p-3 border-2 ${card.power === 'strong' ? 'border-bunker-gold' : 'border-bunker-border'}`}>
              <div className="flex gap-2 mb-2">
                <span className="text-2xl">{card.emoji}</span>
                <div>
                  <div className="font-bold text-sm text-bunker-text">{card.name} {card.power === 'strong' && '⭐'}</div>
                  <div className="text-xs text-bunker-muted">{card.description}</div>
                </div>
              </div>

              {card.category === 'passive' && (
                <Button variant="purple" size="sm" fullWidth onClick={() => {
                  socket.emit('activatePassiveCard', { roomId, playerId, cardIndex: idx }, (res: any) => { if (!res?.success) alert(res?.error); });
                }}>Активировать</Button>
              )}

              {card.category === 'special' && card.type === 'joker' && (
                jokerCardIndex === idx ? (
                  <div className="grid grid-cols-2 gap-1">
                    {JOKER_OPTIONS.map(opt => (
                      <Button key={opt.type} variant="ghost" size="sm" onClick={() => {
                        socket.emit('useJoker', { roomId, playerId, cardIndex: idx, newType: opt.type }, (res: any) => {
                          if (!res?.success) alert(res?.error);
                          setJokerCardIndex(null);
                        });
                      }}>{opt.emoji} {opt.name}</Button>
                    ))}
                  </div>
                ) : (
                  <Button variant="gold" size="sm" fullWidth onClick={() => setJokerCardIndex(idx)}>🃏 Превратить в...</Button>
                )
              )}

              {card.category === 'instant' && card.needsTarget && (
                <div className="space-y-2">
                  {card.type === 'referendum' ? (
                    <div className="bg-bunker-surface2 p-2 rounded-lg space-y-2">
                      <select value={referendumTarget} onChange={(e) => setReferendumTarget(e.target.value)} className="w-full bg-bunker-bg border border-bunker-border rounded p-2 text-xs">
                        <option value="">Кого защитить?</option>
                        {room.players.filter((p: any) => p.isAlive).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Button variant="primary" size="sm" fullWidth onClick={() => {
                        if (!referendumTarget) return alert('Выберите игрока');
                        socket.emit('useReferendum', { roomId, playerId, cardIndex: idx, protectedId: referendumTarget }, (res: any) => { if (!res?.success) alert(res?.error); });
                      }}>Запустить</Button>
                    </div>
                  ) : (
                    <>
                      {card.type === 'reveal' && (
                        <select value={revealFieldByCard[idx] || 'profession'} onChange={(e) => setRevealFieldByCard(prev => ({ ...prev, [idx]: e.target.value }))} className="w-full bg-bunker-bg border border-bunker-border rounded p-2 text-xs">
                          {fieldsConfig.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      )}
                      <div className="grid grid-cols-2 gap-1">
                        {room.players.filter((p: any) => p.isAlive && p.id !== playerId).map((t: any) => (
                          <Button key={t.id} variant="ghost" size="sm" onClick={() => {
                            const emit = (ev: string, data: any) => socket.emit(ev, data, (res: any) => { if (!res?.success) alert(res?.error); });
                            if (card.type === 'blockVote') emit('useBlockVote', { roomId, playerId, targetId: t.id, cardIndex: idx });
                            else if (card.type === 'discredit') emit('useDiscredit', { roomId, playerId, targetId: t.id, cardIndex: idx });
                            else if (card.type === 'isolate') emit('useIsolate', { roomId, playerId, targetId: t.id, cardIndex: idx });
                            else emit('useActionCard', { roomId, playerId, targetId: t.id, cardIndex: idx, field: revealFieldByCard[idx] || 'profession' });
                          }}>{t.name}</Button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {card.category === 'instant' && !card.needsTarget && (
                <div className="space-y-2">
                  {card.type === 'mutation' && (
                    mutationCardIndex === idx ? (
                      <div className="bg-bunker-surface2 p-2 rounded-lg space-y-2">
                        <select value={mutationField || ''} onChange={(e) => setMutationField(e.target.value)} className="w-full bg-bunker-bg border border-bunker-border rounded p-2 text-xs">
                          <option value="">Выберите характеристику</option>
                          {fieldsConfig.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" className="flex-1" onClick={() => {
                            if (!mutationField) return alert('Выберите характеристику');
                            socket.emit('startMutation', { roomId, playerId, cardIndex: idx, field: mutationField }, (r1: any) => {
                              if (r1?.success) {
                                socket.emit('confirmMutation', { roomId, playerId, cardIndex: idx }, (r2: any) => {
                                  if (!r2?.success) alert(r2?.error);
                                  setMutationCardIndex(null);
                                });
                              } else alert(r1?.error);
                            });
                          }}>Готово</Button>
                          <Button variant="ghost" size="sm" onClick={() => setMutationCardIndex(null)}>✕</Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="gold" size="sm" fullWidth onClick={() => { setMutationCardIndex(idx); setMutationField(null); }}>🧬 Мутировать</Button>
                    )
                  )}

                  {card.type === 'shield' && (
                    <Button variant="primary" size="sm" fullWidth onClick={() => {
                      socket.emit('useActionCardNoTarget', { roomId, playerId, cardIndex: idx }, (res: any) => { if (!res?.success) alert(res?.error); });
                    }}>🛡️ Активировать защиту</Button>
                  )}

                  {(card.type.startsWith('change') || card.type.startsWith('double')) && (
                    <Button variant="ghost" size="sm" fullWidth onClick={() => {
                      const ev = card.type.startsWith('double') ? 'useDoubleCard' : 'useChangeCard';
                      socket.emit(ev, { roomId, playerId, cardIndex: idx }, (res: any) => { if (!res?.success) alert(res?.error); });
                    }}>✨ Применить</Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  const renderBunker = () => (
    <div className="space-y-3">
      <Collapsible title="☢️ Катастрофа" defaultOpen accent="red">
        <div className="font-bold text-bunker-red mb-2">{room.catastrophe?.name}</div>
        <p className="text-xs text-bunker-text mb-2">{room.catastrophe?.description}</p>
        <ul className="text-xs text-bunker-muted list-disc pl-4 space-y-1">
          {room.catastrophe?.features.map((f: string, i: number) => <li key={i}>{f}</li>)}
        </ul>
      </Collapsible>
      <Collapsible title="🏚️ Бункер" accent="green">
        <div className="font-bold text-bunker-green mb-2">{room.bunker?.name}</div>
        <p className="text-xs text-bunker-text mb-2">{room.bunker?.capacity}</p>
        <div className="text-xs text-bunker-muted">Состояние: {room.bunker?.state}</div>
      </Collapsible>
    </div>
  );

  return (
    <div className="min-h-screen pb-safe-nav bg-bunker-bg">
      <header className="sticky-header px-4 py-3 flex justify-between items-center">
        <div>
          <div className="text-[10px] text-bunker-muted uppercase">Раунд {room.currentRound}</div>
          <div className="text-sm font-bold text-bunker-amber truncate max-w-[200px]">{room.catastrophe?.name}</div>
        </div>
        {speaker && <div className="badge bg-bunker-amber/20 text-bunker-amber border-bunker-amber/30">🎤 {speaker.name}</div>}
      </header>

      <main className="p-4 max-w-md mx-auto animate-fade-in">
        {activeTab === 'players' && renderPlayers()}
        {activeTab === 'cards' && renderCards()}
        {activeTab === 'bunker' && renderBunker()}
        {activeTab === 'chat' && <Chat roomId={room.id} initialMessages={room.messages || []} />}
      </main>

      <BottomNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
    </div>
  );
};