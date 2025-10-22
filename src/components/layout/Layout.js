import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Add useNavigate
import { useAuth } from '../../contexts/AuthContext'; // Add this import
import '../../App.css';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate(); // Add this hook
  const { user, signOut } = useAuth(); // Add this hook

  const isActive = (path) => {
    return location.pathname === path;
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (!error) {
      navigate('/auth');
    }
  };

  return (
    <div className="App">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-content">
          <div className="nav-logo">PipelineXR</div>
          <div className="nav-links">
            <Link 
              to="/" 
              className={isActive('/') ? 'active' : ''}
              style={{ 
                color: 'white', 
                textDecoration: 'none', 
                marginLeft: '30px', 
                fontSize: '16px', 
                fontWeight: isActive('/') ? '700' : '500',
                transition: 'opacity 0.3s ease'
              }}
            >
              Home
            </Link>
            <Link 
              to="/features" 
              className={isActive('/features') ? 'active' : ''}
              style={{ 
                color: 'white', 
                textDecoration: 'none', 
                marginLeft: '30px', 
                fontSize: '16px', 
                fontWeight: isActive('/features') ? '700' : '500',
                transition: 'opacity 0.3s ease'
              }}
            >
              Features
            </Link>

            <Link 
              to="/how-it-works" 
              className={isActive('/how-it-works') ? 'active' : ''}
              style={{ 
                color: 'white', 
                textDecoration: 'none', 
                marginLeft: '30px', 
                fontSize: '16px', 
                fontWeight: isActive('/how-it-works') ? '700' : '500',
                transition: 'opacity 0.3s ease'
              }}
            >
              How It Works
            </Link>
            
            {/* User-specific navigation */}
            {user ? (
              <>
                <Link 
                  to="/dashboard" 
                  className={isActive('/dashboard') ? 'active' : ''}
                  style={{ 
                    color: 'white', 
                    textDecoration: 'none', 
                    marginLeft: '30px', 
                    fontSize: '16px', 
                    fontWeight: isActive('/dashboard') ? '700' : '500',
                    transition: 'opacity 0.3s ease'
                  }}
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    marginLeft: '30px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'opacity 0.3s ease'
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link 
                to="/auth" 
                className={isActive('/auth') ? 'active' : ''}
                style={{ 
                  color: 'white', 
                  textDecoration: 'none', 
                  marginLeft: '30px', 
                  fontSize: '16px', 
                  fontWeight: isActive('/auth') ? '700' : '500',
                  transition: 'opacity 0.3s ease'
                }}
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      
      {/* Main content */}
      <div className="content">
        {children}
      </div>
    </div>
  );
};

export default Layout;