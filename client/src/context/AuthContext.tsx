import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isGuest: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('bunker_token');
    const savedUser = localStorage.getItem('bunker_user');
    const savedGuest = localStorage.getItem('bunker_guest');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } else if (savedGuest === 'true') {
      setIsGuest(true);
    }
  }, []);

  const refreshUser = async () => {
    const savedToken = localStorage.getItem('bunker_token');
    if (!savedToken) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('bunker_user', JSON.stringify(data.user));
      }
    } catch (e) {
      console.error('Ошибка обновления профиля:', e);
    }
  };

  const login = async (username: string, password: string) => {
    const data = await api.post('/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('bunker_token', data.token);
    localStorage.setItem('bunker_user', JSON.stringify(data.user));
    localStorage.removeItem('bunker_guest');
  };

  const register = async (username: string, password: string) => {
    const data = await api.post('/register', { username, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('bunker_token', data.token);
    localStorage.setItem('bunker_user', JSON.stringify(data.user));
    localStorage.removeItem('bunker_guest');
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('bunker_guest', 'true');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsGuest(false);
    localStorage.removeItem('bunker_token');
    localStorage.removeItem('bunker_user');
    localStorage.removeItem('bunker_guest');
  };

  return (
    <AuthContext.Provider value={{ user, token, isGuest, login, register, continueAsGuest, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};