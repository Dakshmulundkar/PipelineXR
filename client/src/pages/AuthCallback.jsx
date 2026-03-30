import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = ({ onLogin }) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('Authenticating...');

    useEffect(() => {
        const err = searchParams.get('error');

        if (err) {
            console.error('Auth error:', err);
            setTimeout(() => {
                setStatus('Authentication failed');
                localStorage.removeItem('sf_auth');
                setTimeout(() => navigate('/login', { replace: true }), 2000);
            }, 0);
            return;
        }

        // Always verify session server-side — never trust URL params for tokens
        setTimeout(() => setStatus('Verifying session...'), 0);
        const apiBase = import.meta.env.VITE_API_BASE_URL || '';
        fetch(`${apiBase}/auth/user`, { credentials: 'include' })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Not authenticated');
            })
            .then(data => {
                if (data.authenticated && data.user) {
                    localStorage.setItem('sf_auth', 'true');
                    if (onLogin) onLogin();
                    setTimeout(() => setStatus('Success! Redirecting...'), 0);
                    setTimeout(() => navigate('/', { replace: true }), 500);
                } else {
                    throw new Error('Session not valid');
                }
            })
            .catch(err => {
                console.error('Session check failed:', err);
                localStorage.removeItem('sf_auth');
                setTimeout(() => setStatus('Session expired'), 0);
                setTimeout(() => navigate('/login', { replace: true }), 2000);
            });
    }, [searchParams, navigate, onLogin]);

    return (
        <div className="min-h-screen bg-[#06060A] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 animate-fade-in">
                <div className="w-8 h-8 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
                <div className="text-sm font-medium text-slate-400">{status}</div>
            </div>
        </div>
    );
};

export default AuthCallback;
