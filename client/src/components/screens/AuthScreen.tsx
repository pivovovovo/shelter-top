import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

export const AuthScreen: React.FC = () => {
  const { login, register, continueAsGuest } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col justify-center max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-black text-amber-glow mb-2 tracking-tight">БУНКЕР</h1>
        <p className="text-bunker-muted text-sm uppercase tracking-widest font-mono">
          Авторизация
        </p>
      </div>

      <Card className="p-6">
        {/* Табы */}
        <div className="flex bg-bunker-surface2 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${isLogin ? 'bg-bunker-amber text-black shadow-warm-sm' : 'text-bunker-muted'}`}
          >
            Вход
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${!isLogin ? 'bg-bunker-amber text-black shadow-warm-sm' : 'text-bunker-muted'}`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Имя пользователя"
            placeholder="Введите логин"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <div className="text-bunker-red text-xs text-center">{error}</div>}

          <Button type="submit" fullWidth size="lg" loading={loading}>
            {isLogin ? 'Войти' : 'Создать аккаунт'}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-bunker-border"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-bunker-surface px-2 text-bunker-muted">Или</span></div>
        </div>

        <Button type="button" variant="ghost" fullWidth onClick={continueAsGuest}>
          🎮 Играть как гость
        </Button>
      </Card>
    </div>
  );
};