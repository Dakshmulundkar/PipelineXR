import { useEffect, useState, useRef } from 'react';
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
            localStorage.removeItem('gh_token');
            setTimeout(() => navigate('/login', { replace: true }), 2000);
            return;
        }

        const statusParam = searchParams.get('status');
        const payloadParam = searchParams.get('payload');

        if (statusParam === 'success' && payloadParam) {
            try {
                const user = JSON.parse(decodeURIComponent(payloadParam));

                // Store token for Railway API calls
                if (user.token) {
                    localStorage.setItem('gh_token', user.token);
                }

                // Store user info (without token)
                const { token: _t, ...userWithoutToken } = user;
                localStorage.setItem('pxr_user', JSON.stringify(userWithoutToken));
                localStorage.setItem('sf_auth', 'true');

                if (onLogin) onLogin();
                setStatus('Success! Loading dashboard...');
                // Clean URL then navigate
                window.history.replaceState({}, '', '/auth/callback');
                setTimeout(() => navigate('/', { replace: true }), 100);
                return;
            } catch (e) {
                console.error('Payload parse failed:', e.message);
            }
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
                    animation: 'spin 0.8s linear infinite',
                }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>{status}</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
};

export default AuthCallback;
