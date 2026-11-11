import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../lib/socket';

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export const Chat: React.FC<{ roomId: string; initialMessages: ChatMessage[] }> = ({ roomId, initialMessages }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const playerId = localStorage.getItem('bunker_playerId') || '';
  const playerName = localStorage.getItem('bunker_playerName') || 'Игрок';

  useEffect(() => { setMessages(initialMessages); }, [initialMessages]);
  
  useEffect(() => {
    const onNew = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);
    socket.on('newMessage', onNew);
    return () => { socket.off('newMessage', onNew); };
  }, []);

  const send = () => {
    if (!text.trim()) return;
    socket.emit('sendMessage', { roomId, playerId, playerName, text: text.trim() }, (res: any) => {
      if (res?.success) {
        setText('');
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    });
  };

  return (
    <div className="flex flex-col h-full min-h-[50vh]">
      <div className="flex-1 overflow-y-auto space-y-2 mb-4 scroll-hide">
        {messages.length === 0 ? (
          <div className="text-center text-bunker-muted text-sm py-10 italic">Пока нет сообщений</div>
        ) : (
          messages.map(m => {
            const isMe = m.playerId === playerId;
            const isSys = m.playerId === '__system__';
            return (
              <div key={m.id} className={`text-sm p-2 rounded-lg ${isSys ? 'bg-bunker-amber/10 text-bunker-amber italic border-l-2 border-bunker-amber' : isMe ? 'bg-bunker-surface2 text-bunker-text' : 'text-bunker-muted'}`}>
                <span className="text-xs opacity-50 mr-2">{new Date(m.timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
                <span className={`font-bold ${isSys ? 'text-bunker-amber' : isMe ? 'text-bunker-amber' : 'text-bunker-text'}`}>{m.playerName}:</span>{' '}
                <span className="break-words">{m.text}</span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          value={text} 
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Сообщение..."
          className="flex-1 bg-bunker-bg border border-bunker-border rounded-xl px-3 py-2 text-sm focus:border-bunker-amber outline-none"
        />
        <button onClick={send} className="btn-primary !px-4 !min-h-[40px]">📤</button>
      </div>
    </div>
  );
};