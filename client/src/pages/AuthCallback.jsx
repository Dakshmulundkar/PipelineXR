import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = ({ onLogin }) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('Authenticating...');
    const ran = useRef(false); // prevent double-run in React StrictMode

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const err = searchParams.get('error');
        if (err) {
            setStatus('Authentication failed');
            localStorage.removeItem('sf_auth');
            setTimeout(() => navigate('/login', { replace: true }), 2000);
            return;
        }

        const statusParam = searchParams.get('status');
        if (statusParam !== 'success') {
            setStatus('No auth data received');
            setTimeout(() => navigate('/login', { replace: true }), 2000);
            return;
        }

        // status=success — verify the session is actually alive on the backend
        setStatus('Verifying session...');
        const apiBase = import.meta.env.VITE_API_BASE_URL || '';

        fetch(`${apiBase}/auth/user`, { credentials: 'include' })            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (data.authenticated && data.user) {
                    // Mark authenticated BEFORE navigating so App.jsx sees it
                    localStorage.setItem('sf_auth', 'true');
                    if (onLogin) onLogin();
                    setStatus('Success! Loading dashboard...');
                    // Small delay so React state update propagates before route change
                    setTimeout(() => navigate('/', { replace: true }), 100);
                } else {
                    throw new Error('Session not valid');
                }
            })
            .catch(e => {
                console.error('[AuthCallback] Session check failed:', e.message);
                localStorage.removeItem('sf_auth');
                setStatus('Session verification failed — please try again');
                setTimeout(() => navigate('/login', { replace: true }), 2500);
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div style={{ minHeight: '100vh', background: '#06060A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: '2px solid #3B82F6', borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite'
                }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>{status}</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
};

export default AuthCallback;
