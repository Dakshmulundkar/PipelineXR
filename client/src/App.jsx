import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Security from './pages/Security';
import Pipelines from './pages/Pipelines';
import Metrics from './pages/Metrics';
import Reports from './pages/Reports';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import { AppProvider } from './contexts/AppContext';

const ProtectedRoute = ({ children, isAuthenticated }) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return (
    <Layout>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
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
            {/* Public Routes */}
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/auth/callback" element={<AuthCallback onLogin={() => setIsAuthenticated(true)} />} />

            {/* Protected Routes — each page wrapped in ErrorBoundary */}
            <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Dashboard /></ProtectedRoute>} />
            <Route path="/pipelines" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Pipelines /></ProtectedRoute>} />
            <Route path="/security" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Security /></ProtectedRoute>} />
            <Route path="/metrics" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Metrics /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Reports /></ProtectedRoute>} />

            <Route path="*" element={
              <div className="flex flex-col items-center justify-center h-full py-20 animate-fade-in">
                <div className="text-6xl mb-4">🚧</div>
                <div className="text-2xl font-bold text-white mb-2 tracking-tight">Page Not Found</div>
                <div className="text-sm text-slate-400">The requested view does not exist.</div>
              </div>
            } />
          </Routes>
        </AppProvider>
      </div>
    </BrowserRouter>
  );
}

export default App;
