import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = ({ onLogin }) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('Authenticating...');
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const err = searchParams.get('error');
        if (err) {
            setStatus('Authentication failed');
            localStorage.removeItem('sf_auth');
            localStorage.removeItem('pxr_user');
            setTimeout(() => navigate('/login', { replace: true }), 2000);
            return;
        }

        const statusParam = searchParams.get('status');
        if (statusParam === 'success') {
            // Store non-sensitive user info passed from Railway in the redirect URL
            const userParam = searchParams.get('user');
            if (userParam) {
                try {
                    const user = JSON.parse(decodeURIComponent(userParam));
                    localStorage.setItem('pxr_user', JSON.stringify(user));
                } catch { /* non-fatal */ }
            }

            localStorage.setItem('sf_auth', 'true');
            if (onLogin) onLogin();
            setStatus('Success! Loading dashboard...');
            setTimeout(() => navigate('/', { replace: true }), 100);
            return;
        }

        setStatus('Authentication failed');
        localStorage.removeItem('sf_auth');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
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
