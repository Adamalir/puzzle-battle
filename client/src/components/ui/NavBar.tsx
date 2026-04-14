import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

export default function NavBar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();

  return (
    <nav className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg tracking-tight text-white hover:text-brand-400 transition-colors">
          <span className="text-2xl">⚡</span>
          <span>Puzzle Battle</span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} title={connected ? 'Connected' : 'Disconnected'} />
          )}
          {user ? (
            <>
              <Link to="/lobby" className="btn-ghost text-sm hidden sm:inline-flex">Play</Link>
              <Link to="/profile" className="btn-ghost text-sm hidden sm:inline-flex">{user.username}</Link>
              <button onClick={() => { logout(); navigate('/'); }} className="btn-secondary text-sm">
                Sign out
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn-primary text-sm">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
