'use client';

import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

type Props = {
    onLogin: () => void;
};

export default function LoginScreen({ onLogin }: Props) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Check if already logged in (cookie is httpOnly, can't read directly)
    useEffect(() => {
        const checkAuth = async () => {
            // Try to access a protected endpoint - browser sends cookie automatically
            const res = await fetch('/api/content', {
                credentials: 'same-origin'
            });
            if (res.ok) {
                onLogin();
            }
        };
        checkAuth();
    }, [onLogin]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });

            if (res.ok) {
                onLogin();
            } else {
                setError('Invalid PIN');
            }
        } catch (e) {
            setError('Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 w-full max-w-md">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tighter">LOCALFLIX</h1>
                    <p className="text-neutral-400 mt-2">Enter PIN to access your library</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="Enter PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-red-600 transition"
                        autoFocus
                    />
                    
                    {error && (
                        <p className="text-red-500 text-sm text-center">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading || pin.length < 4}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
                    >
                        {loading ? 'Checking...' : 'Unlock'}
                    </button>
                </form>

                <p className="text-xs text-neutral-600 text-center mt-6">
                    Default PIN: 1234 (change in .env.local)
                </p>
            </div>
        </div>
    );
}
