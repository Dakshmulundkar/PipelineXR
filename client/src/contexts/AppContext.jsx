import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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

    // ── Shared data — fetched once, consumed by any page ─────────────────────
    // Security summary (vuln counts) — used by Dashboard + Security + Reports
    const [secSummary, setSecSummary] = useState(null);
    const [secSummaryRepo, setSecSummaryRepo] = useState(null);

    // Refs for socket listener to avoid stale closures — updated on every render
    const selectedRepoRef = useRef(selectedRepo);
    const secSummaryRepoRef = useRef(secSummaryRepo);
    selectedRepoRef.current = selectedRepo;
    secSummaryRepoRef.current = secSummaryRepo;

    // Monitor sites — used by Dashboard + Monitoring page
    const [monitorSites, setMonitorSites] = useState([]);
    const [monitorSitesLoaded, setMonitorSitesLoaded] = useState(false);

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

        // In production, Socket.io is on Railway. In dev, it's on the local proxy.
        const socketUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

        const socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            withCredentials: true,
        });

        socket.on('connect', () => console.log('🔌 Socket connected:', socket.id));
        socket.on('disconnect', () => console.log('🔌 Socket disconnected'));

        // Listen for scan completion events — refresh secSummary for the relevant repo
        socket.on('security_update', (payload) => {
            if (payload?.type === 'SCAN_COMPLETED' && payload?.repository) {
                const repo = payload.repository;
                // Only refresh if this matches the currently selected repo
                if (selectedRepoRef.current === repo) {
                    api.getSecuritySummary(repo).then(d => {
                        if (d) {
                            setSecSummary(d);
                            setSecSummaryRepo(repo);
                        }
                    }).catch(() => {});
                }
            }
        });

        socketRef.current = socket;

        return () => {
            socket.off('security_update');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;

        // Load user from localStorage (set by AuthCallback)
        const stored = localStorage.getItem('pxr_user');
        if (stored) {
            try {
                const u = JSON.parse(stored);
                setUser(u);
                setIsAdmin(u.isAdmin === true);
            } catch { /* ignore */ }
        }

        // Fetch repos — uses gh_token via x-github-token header interceptor
        api.getRepos().then(data => {
            if (Array.isArray(data)) {
                setRepos(data);
                if (data.length > 0) {
                    setSelectedRepo(prev => prev || data[0].full_name);
                }
            }
        }).catch(() => setSelectedRepo(''));

        // Fetch monitor sites once on login — shared by Dashboard + Monitoring
        api.getMonitorSites()
            .then(d => { setMonitorSites(Array.isArray(d) ? d : []); setMonitorSitesLoaded(true); })
            .catch(() => { setMonitorSites([]); setMonitorSitesLoaded(true); });
    }, [isAuthenticated]);

    // Refresh security summary when selected repo changes
    useEffect(() => {
        if (!selectedRepo || selectedRepo === secSummaryRepo) return;
        api.getSecuritySummary(selectedRepo)
            .then(d => { setSecSummary(d); setSecSummaryRepo(selectedRepo); })
            .catch(() => {});
    }, [selectedRepo, secSummaryRepo]);

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
            // Shared data — avoids redundant fetches across pages
            secSummary, setSecSummary,
            monitorSites, setMonitorSites, monitorSitesLoaded,
        }}>
            {children}
        </AppContext.Provider>
    );
};
