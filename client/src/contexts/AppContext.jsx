import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from '../services/api';

const AppContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children, isAuthenticated }) => {
    const [user, setUser] = useState(null);
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const socketRef = useRef(null);

    // Global scan state — persists across page navigation
    const [scanState, setScanState] = useState({
        isScanning: false,
        repoScanned: null,
        results: null,          // raw vulnerabilities array
        security_metrics: null,
        risk_score: null,
        risk_level: null,
        engine: null,
        error: null,
    });

    // Centralized Socket.io connection — shared by all pages
    useEffect(() => {
        if (!isAuthenticated) return;

        const socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => console.log('🔌 Socket connected:', socket.id));
        socket.on('disconnect', () => console.log('🔌 Socket disconnected'));

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;

        api.checkAuth().then(res => {
            if (res.authenticated && res.user) {
                setUser(res.user);
                setIsAdmin(res.isAdmin === true);
            } else {
                localStorage.removeItem('sf_auth');
                window.location.href = '/login';
            }
        }).catch(() => {
            localStorage.removeItem('sf_auth');
            window.location.href = '/login';
        });

        api.getRepos().then(data => {
            if (Array.isArray(data)) {
                setRepos(data);
                if (data.length > 0) {
                    setSelectedRepo(prev => prev || data[0].full_name);
                } else {
                    setSelectedRepo('');
                }
            }
        }).catch(() => { setSelectedRepo(''); });
    }, [isAuthenticated]);

    // Start a background scan — safe to call from any page
    const startScan = useCallback(async (repo) => {
        if (!repo) return;

        setScanState(prev => {
            // Already scanning this repo — don't double-trigger
            if (prev.isScanning && prev.repoScanned === repo) return prev;
            return {
                ...prev,
                isScanning: true,
                repoScanned: repo,
                results: null,
                security_metrics: null,
                risk_score: null,
                risk_level: null,
                engine: null,
                error: null,
            };
        });

        // Read current state after the set — use a ref to avoid stale closure
        try {
            const target = `https://github.com/${repo}`;
            const res = await api.triggerTrivyScan({
                type: 'repo',
                target,
                repository: repo,
                options: { severity: 'CRITICAL,HIGH,MEDIUM,LOW', ignoreUnfixed: false, useDocker: true }
            });

            setScanState({
                isScanning: false,
                repoScanned: repo,
                results: res.results || [],
                security_metrics: res.security_metrics || null,
                risk_score: res.risk_score ?? null,
                risk_level: res.risk_level ?? null,
                engine: res.engine || null,
                error: null,
            });
        } catch (err) {
            setScanState(prev => ({
                ...prev,
                isScanning: false,
                error: err.response?.data?.error || err.message,
            }));
        }
    }, []); // no deps — uses setScanState functional form to avoid stale state

    return (
        <AppContext.Provider value={{
            user, repos, selectedRepo, setSelectedRepo,
            isAdmin,
            socket: socketRef.current,
            scanState, startScan,
        }}>
            {children}
        </AppContext.Provider>
    );
};
