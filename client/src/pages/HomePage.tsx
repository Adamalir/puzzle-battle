import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

const PUZZLES = [
  {
    name: 'Wordle',
    icon: '🔤',
    desc: 'Guess the 5-letter word in 6 tries with color-coded feedback.',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  {
    name: 'Star Battle',
    icon: '⭐',
    desc: 'Place stars on a grid so each row, column & region has exactly N stars — no stars touching.',
    color: 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30',
  },
  {
    name: 'Connections',
    icon: '🔗',
    desc: 'Group 16 words into 4 hidden categories. Watch out — some links are tricky.',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
  },
];

const FEATURES = [
  { icon: '⚡', title: 'Real-time racing', desc: 'Race up to 8 players simultaneously with live progress tracking.' },
  { icon: '👁️', title: 'Spectator mode', desc: 'Watch friends compete live without joining the game.' },
  { icon: '🏆', title: 'Win/loss records', desc: 'Build your profile, track stats, and earn badges.' },
  { icon: '🔗', title: 'Easy sharing', desc: 'Share a 6-character room code or link to invite anyone.' },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-20"
      >
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
          Puzzle Battle
        </h1>
        <p className="text-xl text-gray-400 max-w-xl mx-auto mb-8">
          Logic puzzles. Real-time racing. Outsmart your friends.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {user ? (
            <Link to="/lobby" className="btn-primary text-base px-8 py-3">
              Play Now
            </Link>
          ) : (
            <>
              <Link to="/auth" className="btn-primary text-base px-8 py-3">
                Get Started — Free
              </Link>
              <Link to="/auth?mode=guest" className="btn-secondary text-base px-8 py-3">
                Play as Guest
              </Link>
            </>
          )}
        </div>
      </motion.div>

      {/* Puzzles */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-20"
      >
        <h2 className="text-2xl font-bold text-center mb-8 text-gray-200">Three Puzzles. One Race.</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {PUZZLES.map((p) => (
            <div
              key={p.name}
              className={`card border bg-gradient-to-br ${p.color} hover:scale-[1.02] transition-transform`}
            >
              <div className="text-4xl mb-3">{p.icon}</div>
              <h3 className="font-bold text-lg mb-2">{p.name}</h3>
              <p className="text-sm text-gray-400">{p.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <h2 className="text-2xl font-bold text-center mb-8 text-gray-200">Built for Competition</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card text-center hover:border-brand-500/50 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
