import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

type Mode = 'login' | 'register' | 'guest';

export default function AuthPage() {
  const { user, login, register, loginAsGuest, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'guest' ? 'guest' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => { if (user) navigate('/lobby'); }, [user]);
  useEffect(() => { clearError(); }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') await login(username, password);
    else if (mode === 'register') await register(username, password);
    else await loginAsGuest(displayName);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="card">
          <div className="text-center mb-6">
            <span className="text-4xl">⚡</span>
            <h1 className="text-2xl font-bold mt-2">Welcome to Puzzle Battle</h1>
          </div>

          {/* Mode tabs */}
          <div className="flex bg-dark-700 rounded-lg p-1 mb-6">
            {(['login', 'register', 'guest'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${mode === m ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {m === 'login' ? 'Sign In' : m === 'register' ? 'Register' : 'Guest'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'guest' ? (
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-300">Display Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Choose a display name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  maxLength={20}
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-300">Username</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    maxLength={20}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-300">Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn-primary w-full py-2.5" disabled={isLoading}>
              {isLoading ? 'Loading…' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Play as Guest'}
            </button>
          </form>

          {mode === 'guest' && (
            <p className="mt-4 text-xs text-center text-gray-500">
              Guest progress is not saved. <button onClick={() => setMode('register')} className="text-brand-400 hover:underline">Create an account</button> to track stats.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
