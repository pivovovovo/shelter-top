import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AuthScreen } from './components/screens/AuthScreen';
import { Home } from './components/screens/Home';
import { Lobby } from './components/screens/Lobby';
import { Game } from './components/screens/Game';
import { Voting } from './components/screens/Voting';
import { Results } from './components/screens/Results';
import { Board } from './components/screens/Board';

function AppRoutes() {
  const { user, isGuest } = useAuth();

  // Экран ведущего доступен БЕЗ регистрации
  if (window.location.pathname.startsWith('/board/')) {
    return (
      <Routes>
        <Route path="/board/:roomId" element={<Board />} />
      </Routes>
    );
  }

  if (!user && !isGuest) return <AuthScreen />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join/:roomId" element={<Home />} />
      <Route path="/lobby/:roomId" element={<Lobby />} />
      <Route path="/game/:roomId" element={<Game />} />
      <Route path="/voting/:roomId" element={<Voting />} />
      <Route path="/results/:roomId" element={<Results />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ConnectionStatus />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;