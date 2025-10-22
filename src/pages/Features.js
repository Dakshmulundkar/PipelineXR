import React from 'react';
import { Link } from 'react-router-dom';
import { FaRocket, FaShieldAlt, FaBell, FaChartLine, FaUserFriends, FaCode, FaPlug, FaBolt, FaSync, FaVial, FaShip } from 'react-icons/fa';
import { GiProcessor } from 'react-icons/gi';
import Hyperspeed from '../components/Hyperspeed';
import Layout from '../components/layout/Layout';
import '../App.css';

const Features = () => {
  // Speed control functions for Hyperspeed component
  const handleSpeedUp = () => {
    // Speed up functionality is handled by the Hyperspeed component
  };
  
  const handleSlowDown = () => {
    // Slow down functionality is handled by the Hyperspeed component
  };

  return (
    <Layout>
      {/* Hyperspeed background */}
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
      
      {/* Content */}
      <div className="content">
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-content">
            <h1 className="hero-title">All Features.</h1>
            <p className="hero-subtitle">Explore the power of PipelineXR's automation.</p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              >
                See All Benefits
              </button>
              <button 
                className="btn btn-secondary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              >
                Get Started
              </button>
            </div>
          </div>
        </section>
        
        {/* CI/CD Pipeline Features */}
        <section className="features-steps">
          <div className="feature-step">
            <div className="feature-step-content">
              <h3>Continuous integration.</h3>
              <p>Merge code changes effortlessly with early issue detection and resolution.</p>
            </div>
            <div className="feature-step-placeholder">
              <FaSync />
            </div>
          </div>
          
          <div className="feature-step">
            <div className="feature-step-placeholder">
              <FaVial />
            </div>
            <div className="feature-step-content">
              <h3>Automated testing.</h3>
              <p>Execute comprehensive test suites—ensuring code quality at every step.</p>
            </div>
          </div>
          
          <div className="feature-step">
            <div className="feature-step-content">
              <h3>Continuous deployment.</h3>
              <p>Deploy with zero friction to staging or production, every time.</p>
            </div>
            <div className="feature-step-placeholder">
              <FaShip />
            </div>
          </div>
        </section>
        
        {/* Features Grid - Centered Section */}
        <section className="features-grid centered-feature-cards">
          <div className="feature-card">
            <div className="feature-card-icon">
              <GiProcessor />
            </div>
            <div className="feature-card-content">
              <h3>Smart testing.</h3>
              <p>PipelineXR runs automated test suites, generates detailed reports, and integrates with popular QA tools.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaShieldAlt />
            </div>
            <div className="feature-card-content">
              <h3>Security checks.</h3>
              <p>Built-in static code analysis and real-time vulnerability scanning protect your code.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaBell />
            </div>
            <div className="feature-card-content">
              <h3>Custom notifications.</h3>
              <p>Get Slack, Teams, or email alerts for pipeline events and build results instantly.</p>
            </div>
          </div>
        </section>
        
        {/* Additional Features Grid */}
        <section className="features-grid additional-features">
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaChartLine />
            </div>
            <div className="feature-card-content">
              <h3>Unified dashboard</h3>
              <p>Monitor all your projects and pipelines in one centralized view.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaRocket />
            </div>
            <div className="feature-card-content">
              <h3>Fast onboarding</h3>
              <p>Connect your repository and deploy in minutes, not hours.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaUserFriends />
            </div>
            <div className="feature-card-content">
              <h3>Role control</h3>
              <p>Granular permissions and access controls for team members.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaChartLine />
            </div>
            <div className="feature-card-content">
              <h3>Real analytics</h3>
              <p>Deep insights into build times, success rates, and performance.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <GiProcessor />
            </div>
            <div className="feature-card-content">
              <h3>GitOps ready</h3>
              <p>Full support for GitOps workflows and infrastructure as code.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaCode />
            </div>
            <div className="feature-card-content">
              <h3>CLI support</h3>
              <p>Powerful command-line interface for automation and scripting.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaPlug />
            </div>
            <div className="feature-card-content">
              <h3>Extensible plugins</h3>
              <p>Build custom integrations with our open plugin architecture.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-card-icon">
              <FaBolt />
            </div>
            <div className="feature-card-content">
              <h3>Instant alerts</h3>
              <p>Real-time notifications for build status and system events.</p>
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="footer">
          <div className="footer-bottom">
            <div className="footer-copyright">
              <p>© 2025 PipelineXR. All Rights Reserved.</p>
            </div>
            <div className="footer-links-grid">
              <div className="footer-column">
                <h4>Product</h4>
                <Link to="/">Home</Link>
                <Link to="/features">Features</Link>
                <Link to="/documentation">Documentation</Link>
              </div>
              <div className="footer-column">
                <h4>Company</h4>
                <Link to="/about">About</Link>
                <Link to="/pricing">Pricing</Link>
                <Link to="/careers">Careers</Link>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <Link to="/blog">Blog</Link>
                <Link to="/api">API</Link>
                <Link to="/help">Help Center</Link>
              </div>
              <div className="footer-column">
                <h4>Connect</h4>
                <Link to="/github">GitHub</Link>
                <Link to="/linkedin">LinkedIn</Link>
                <Link to="/twitter">Twitter</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Layout>
  );
};

export default Features;