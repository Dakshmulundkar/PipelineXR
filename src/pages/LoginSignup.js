import React, { useState } from 'react';
import { FaGoogle, FaGithub } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom'; // Add this import
import Hyperspeed from '../components/Hyperspeed';
import Layout from '../components/layout/Layout';
import '../assets/Auth.css';

const LoginSignup = () => {
  const { signInWithEmail, signUpWithEmail, signInWithProvider } = useAuth();
  const navigate = useNavigate(); // Add this hook
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    rememberMe: false
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleSpeedUp = () => {};
  const handleSlowDown = () => {};

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    if (message.text) {
      setMessage({ type: '', text: '' });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let result;
      if (isLogin) {
        result = await signInWithEmail(formData.email, formData.password);
      } else {
        result = await signUpWithEmail(formData.email, formData.password);
      }

      if (result.error) {
        setMessage({ type: 'error', text: result.error.message });
      } else {
        setMessage({
          type: 'success',
          text: isLogin ? 'Successfully logged in!' : 'Account created! Please check your email to verify.'
        });
        if (isLogin) {
          // Redirect to dashboard after successful login
          setTimeout(() => {
            navigate('/dashboard');
          }, 1500);
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await signInWithProvider(provider);
      if (error) {
        setMessage({ type: 'error', text: error.message });
        setIsLoading(false);
      }
      // Note: For OAuth, the redirect will handle the callback
      // The user will be redirected to the callback URL and then to the dashboard
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
      setIsLoading(false);
    }
  };


  return (
    <Layout>
      <div className="background">
        <Hyperspeed
          effectOptions={{
            onSpeedUp: handleSpeedUp,
            onSlowDown: handleSlowDown,
            distortion: 'turbulentDistortion',
            length: 400,
            roadWidth: 12,
            islandWidth: 3,
            lanesPerRoad: 4,
            fov: 90,
            fovSpeedUp: 150,
            speedUp: 2,
            carLightsFade: 0.4,
            totalSideLightSticks: 20,
            lightPairsPerRoadWay: 40,
            shoulderLinesWidthPercentage: 0.05,
            brokenLinesWidthPercentage: 0.1,
            brokenLinesLengthPercentage: 0.5,
            lightStickWidth: [0.12, 0.5],
            lightStickHeight: [1.3, 1.7],
            movingAwaySpeed: [60, 80],
            movingCloserSpeed: [-120, -160],
            carLightsLength: [400 * 0.03, 400 * 0.2],
            carLightsRadius: [0.05, 0.14],
            carWidthPercentage: [0.3, 0.5],
            carShiftX: [-0.8, 0.8],
            carFloorSeparation: [0, 5],
            colors: {
              roadColor: 0x080808,
              islandColor: 0x0a0a0a,
              background: 0x000000,
              shoulderLines: 0x1a1a1a,
              brokenLines: 0x333333,
              leftCars: [0x3498db, 0x9b59b6, 0x1abc9c],
              rightCars: [0xe74c3c, 0xf39c12, 0x2ecc71],
              sticks: 0x3498db
            }
          }}
        />
      </div>

      <div className="auth-page-container">
        <div className="auth-page-card">
          <div className="auth-page-header">
            <h1>PipelineXR</h1>
            <p>{isLogin ? 'Welcome back' : 'Create your account'}</p>
          </div>

          {message.text && (
            <div className={`auth-page-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="auth-page-tabs">
            <button
              className={`auth-page-tab ${isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(true)}
            >
              Login
            </button>
            <button
              className={`auth-page-tab ${!isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(false)}
            >
              Sign Up
            </button>
          </div>

          <div className="auth-page-input-group">
            <label className="auth-page-label">Email Address</label>
            <input
              type="email"
              name="email"
              className="auth-page-input"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleInputChange}
              onMouseEnter={handleSpeedUp}
              onMouseLeave={handleSlowDown}
            />
            {errors.email && <span className="auth-page-error">{errors.email}</span>}
          </div>

          <div className="auth-page-input-group">
            <label className="auth-page-label">Password</label>
            <input
              type="password"
              name="password"
              className="auth-page-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleInputChange}
              onMouseEnter={handleSpeedUp}
              onMouseLeave={handleSlowDown}
            />
            {errors.password && <span className="auth-page-error">{errors.password}</span>}
          </div>

          {!isLogin && (
            <div className="auth-page-input-group">
              <label className="auth-page-label">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                className="auth-page-input"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              />
              {errors.confirmPassword && <span className="auth-page-error">{errors.confirmPassword}</span>}
            </div>
          )}

          <button
            type="button"
            className="auth-page-button auth-page-button-email"
            onClick={handleSubmit}
            disabled={isLoading}
            onMouseEnter={handleSpeedUp}
            onMouseLeave={handleSlowDown}
          >
            {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>

          <div className="auth-page-divider">
            <span>or</span>
          </div>

          <div className="auth-page-social-buttons">
            <button
              type="button"
              className="auth-page-social-button"
              onClick={() => handleSocialLogin('google')}
              disabled={isLoading}
              onMouseEnter={handleSpeedUp}
              onMouseLeave={handleSlowDown}
            >
              <FaGoogle size={20} />
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              className="auth-page-social-button"
              onClick={() => handleSocialLogin('github')}
              disabled={isLoading}
              onMouseEnter={handleSpeedUp}
              onMouseLeave={handleSlowDown}
            >
              <FaGithub size={20} />
              <span>Continue with GitHub</span>
            </button>
          </div>

          <div className="auth-page-footer">
            <p className="auth-page-footer-text">
              By continuing, you agree to PipelineXR's{' '}
              <a href="/terms" className="auth-page-footer-link">Terms of Service</a> and{' '}
              <a href="/privacy" className="auth-page-footer-link">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LoginSignup;