import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { apiUrl } from '../utils/api';

interface Profile {
  id: string;
  username: string;
  createdAt: string;
  stats: {
    totalGames: number; totalWins: number; totalLosses: number;
    wordleGames: number; wordleWins: number; wordleAvgTime: number;
    starBattleGames: number; starBattleWins: number; starBattleAvgTime: number;
    connectionsGames: number; connectionsWins: number; connectionsAvgTime: number;
    eloRating: number;
  } | null;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-brand-400">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function fmtTime(ms: number) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.isGuest) { setLoading(false); return; }
    fetch(apiUrl('/api/profile/me'), { headers: { Authorization: `Bearer ${user.token}` } })
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (user?.isGuest) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">👤</div>
        <h1 className="text-2xl font-bold mb-3">Guest Account</h1>
        <p className="text-gray-400 mb-6">Create a free account to track your stats, win/loss record, and earn badges.</p>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin text-3xl">⚡</div></div>;
  if (!profile) return <div className="text-center py-20 text-gray-400">Failed to load profile.</div>;

  const { stats } = profile;
  const winRate = stats && stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-2xl font-bold">
            {profile.username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.username}</h1>
            <p className="text-gray-400 text-sm">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
            {stats && <p className="text-brand-400 text-sm font-medium mt-0.5">ELO {stats.eloRating}</p>}
          </div>
        </div>

        {stats ? (
          <>
            <h2 className="text-lg font-semibold mb-4 text-gray-300">Overall Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard label="Games Played" value={stats.totalGames} />
              <StatCard label="Wins" value={stats.totalWins} />
              <StatCard label="Losses" value={stats.totalLosses} />
              <StatCard label="Win Rate" value={`${winRate}%`} />
            </div>

            <h2 className="text-lg font-semibold mb-4 text-gray-300">By Puzzle Type</h2>
            <div className="space-y-3">
              {[
                { icon: '🔤', name: 'Wordle', games: stats.wordleGames, wins: stats.wordleWins, avg: stats.wordleAvgTime },
                { icon: '⭐', name: 'Star Battle', games: stats.starBattleGames, wins: stats.starBattleWins, avg: stats.starBattleAvgTime },
                { icon: '🔗', name: 'Connections', games: stats.connectionsGames, wins: stats.connectionsWins, avg: stats.connectionsAvgTime },
              ].map((p) => (
                <div key={p.name} className="card flex items-center gap-4">
                  <span className="text-2xl">{p.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-400">{p.games} games · {p.wins} wins · avg {fmtTime(p.avg)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-brand-400">
                      {p.games > 0 ? `${Math.round((p.wins / p.games) * 100)}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-500">win rate</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">No stats yet — play some games!</div>
        )}
      </motion.div>
    </div>
  );
}
