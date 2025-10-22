import React from 'react';
import { Link } from 'react-router-dom';
import { FaRocket, FaCodeBranch, FaShieldAlt, FaChartLine } from 'react-icons/fa';
import { GiProcessor, GiRollingEnergy } from 'react-icons/gi';
import Hyperspeed from '../components/Hyperspeed';
import Layout from '../components/layout/Layout';
import '../App.css';

const HowItWorks = () => {
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
            <h1 className="hero-title">How PipelineXR Works.</h1>
            <p className="hero-subtitle">Automate delivery from code to deploy.</p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              >
                Get Started
              </button>
              <button 
                className="btn btn-secondary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              >
                See Docs
              </button>
            </div>
          </div>
        </section>
        
        {/* Features Steps */}
        <section className="features-steps">
          <div className="feature-step">
            <div className="feature-step-content">
              <h3>1. Commit Your Code.</h3>
              <p>Push changes to your source repository. PipelineXR detects new commits instantly.</p>
            </div>
            <div className="feature-step-placeholder">
              <FaCodeBranch />
            </div>
          </div>
          
          <div className="feature-step">
            <div className="feature-step-placeholder">
              <GiProcessor />
            </div>
            <div className="feature-step-content">
              <h3>2. Build & Test.</h3>
              <p>Automated builds start, and tests run to guarantee quality at every stage.</p>
            </div>
          </div>
          
          <div className="feature-step">
            <div className="feature-step-content">
              <h3>3. Deploy Automatically.</h3>
              <p>Successful builds trigger secure and reliable deployments to your chosen environment.</p>
            </div>
            <div className="feature-step-placeholder">
              <FaRocket />
            </div>
          </div>
        </section>
        
        {/* Features Grid */}
        <section className="features-grid additional-features">
          <div className="feature-card">
            <div className="feature-placeholder">
              <FaChartLine />
            </div>
            <div className="feature-card-content">
              <h3>Instant monitoring.</h3>
              <p>Track pipeline status in real time from any device—desktop or mobile.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-placeholder">
              <FaShieldAlt />
            </div>
            <div className="feature-card-content">
              <h3>Secure by design.</h3>
              <p>Enterprise-grade security safeguards every build, test, and deploy.</p>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-placeholder">
              <GiRollingEnergy />
            </div>
            <div className="feature-card-content">
              <h3>Seamless rollbacks.</h3>
              <p>Rollback instantly to a previous state for ultimate peace of mind.</p>
            </div>
          </div>
        </section>
        
        {/* Why Developers Love Section */}
        <section className="why-developers">
          <div className="why-developers-content">
            <div className="section-header">
              <h2>Why CI/CD with PipelineXR?</h2>
              <p>PipelineXR gives your team continuous integration and continuous delivery with a streamlined experience. Every code change is automatically verified, built, and deployed, so you release faster—without manual steps.</p>
              <p>From developer commit to production deployment, each step is traceable and auditable, ensuring higher software quality and reduced risk. PipelineXR fits into your workflow so you can focus on building great products.</p>
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

export default HowItWorks;