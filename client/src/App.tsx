import { Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';
import NavBar from './components/ui/NavBar';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function ReconnectBanner() {
  const { reconnecting } = useSocket();
  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{   y: -48, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed top-14 inset-x-0 z-50 flex items-center justify-center gap-2
                     bg-yellow-500/95 text-dark-900 text-sm font-semibold py-2 px-4 shadow-lg"
          role="status"
          aria-live="polite"
        >
          {/* Spinning indicator */}
          <svg
            className="animate-spin w-4 h-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <NavBar />
      <ReconnectBanner />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/lobby" element={<RequireAuth><LobbyPage /></RequireAuth>} />
          <Route path="/room/:code" element={<RequireAuth><GamePage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
