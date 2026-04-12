import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Security from './pages/Security';
import Pipelines from './pages/Pipelines';
import Metrics from './pages/Metrics';
import Reports from './pages/Reports';
import Monitoring from './pages/Monitoring';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import { AppProvider } from './contexts/AppContext';

// Keeps all pages mounted so they load in background and don't re-fetch on nav.
// Only the active page is visible; others are hidden via CSS (display:none).
const KeepAliveRoutes = ({ isAuthenticated }) => {
    const location = useLocation();
    const path = location.pathname;

    if (!isAuthenticated) return null;

    const pages = [
        { route: '/',           Component: Dashboard   },
        { route: '/pipelines',  Component: Pipelines   },
        { route: '/security',   Component: Security    },
        { route: '/metrics',    Component: Metrics     },
        { route: '/reports',    Component: Reports     },
        { route: '/monitoring', Component: Monitoring  },
    ];

    return (
        <Layout>
            {pages.map(({ route, Component }) => (
                <div
                    key={route}
                    style={{ display: path === route ? 'block' : 'none', height: '100%' }}
                >
                    <ErrorBoundary>
                        <Component />
                    </ErrorBoundary>
                </div>
            ))}
        </Layout>
    );
};

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(
        localStorage.getItem('sf_auth') === 'true'
    );

    useEffect(() => {
        const handleStorage = () => setIsAuthenticated(localStorage.getItem('sf_auth') === 'true');
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    return (
        <BrowserRouter>
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[#000000]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(58,130,246,0.08),transparent_40%),radial-gradient(circle_at_85%_30%,rgba(168,85,247,0.06),transparent_40%)]" />
            </div>

            <div className="relative z-10 h-screen w-full" style={{ fontFamily: "'-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'Roboto', sans-serif" }}>
                <AppProvider isAuthenticated={isAuthenticated}>
                    <Routes>
                        {/* Public - accessible without auth */}
                        <Route path="/" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <LandingPage />} />
                        <Route path="/landing" element={<LandingPage />} />
                        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
                        <Route path="/auth/callback" element={<AuthCallback onLogin={() => setIsAuthenticated(true)} />} />

                        {/* All protected pages — kept alive, toggled by CSS */}
                        <Route path="/pipelines" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <Navigate to="/landing" replace />} />
                        <Route path="/security" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <Navigate to="/landing" replace />} />
                        <Route path="/metrics" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <Navigate to="/landing" replace />} />
                        <Route path="/reports" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <Navigate to="/landing" replace />} />
                        <Route path="/monitoring" element={isAuthenticated ? <KeepAliveRoutes isAuthenticated={isAuthenticated} /> : <Navigate to="/landing" replace />} />
                    </Routes>
                </AppProvider>
            </div>
        </BrowserRouter>
    );
}

export default App;
