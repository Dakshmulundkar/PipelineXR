import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Hyperspeed from './components/Hyperspeed';
import HowItWorks from './pages/HowItWorks';
import Features from './pages/Features';
import LoginSignup from './pages/LoginSignup';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import { useAuth } from './contexts/AuthContext'; // Add this import
import './App.css';

// Import or create page components
const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // Add this hook
  
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
      
      {/* Content overlay */}
      <div className="content">
        
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-content">
            <h1 className="hero-title">Accelerate your workflow.</h1>
            <p className="hero-subtitle">Build. Test. Deploy. Automate with PipelineXR.</p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
                onClick={() => user ? navigate('/dashboard') : navigate('/auth')}
              >
                {user ? 'Go to Dashboard' : 'Start for Free'}
              </button>
              <button 
                className="btn btn-secondary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
                onClick={() => navigate('/how-it-works')}
              >
                Learn More
              </button>
            </div>
          </div>
        </section>
        
        {/* Platform Info Section */}
        <section className="platform-info">
          <div className="platform-content">
            <div className="platform-header">
              <h2>PipelineXR Platform</h2>
            </div>
            <div className="platform-description">
              <p>About PipelineXR</p>
              <p>PipelineXR is a next-generation CI/CD automation platform designed for modern teams requiring world-class reliability, speed, and insight. From commit to deployment, every stage is automated with precision and transparency. Visualize your pipeline, monitor in real time, and deliver rapidly with confidence.</p>
              <p>Empower your software development lifecycle with seamless integrations, rigorous security, advanced analytics, and a frictionless user experience—all crafted for professionals seeking a refined solution.</p>
              <button 
                className="btn btn-primary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
                onClick={() => user ? navigate('/dashboard') : navigate('/auth')}
              >
                {user ? 'Go to Dashboard' : 'Get Started'}
              </button>
            </div>
            <div className="integrations">
              <p>Integrates with</p>
              <div className="integration-logos">
                <div className="integration-logo">GitHub</div>
                <div className="integration-logo">GitLab</div>
                <div className="integration-logo">Bitbucket</div>
              </div>
            </div>
            <div className="copyright">
              <p>© 2025</p>
              <p>All Rights Reserved</p>
            </div>
          </div>
        </section>
        
        {/* Features Section */}
        <section className="features">
          <div className="features-content">
            <div className="section-header">
              <h2>How PipelineXR Works</h2>
              <p>Connect your repository with a single click. PipelineXR automatically detects new commits and pull requests, initiating robust pipeline runs. Source code is built, tests are executed, and your application is deployed seamlessly to any cloud, container, or Kubernetes environment.</p>
              <p>Intelligent error handling, precise rollback capabilities, and instant notifications mean your team can focus on what matters most. Visualize every stage Connect Repo → Build & Test → Deploy → Monitor for total control and reliability.</p>
            </div>
            
            <div className="features-steps">
              <div className="feature-step">
                <div className="feature-step-content">
                  <h3>Continuous integration.</h3>
                  <p>Merge code changes effortlessly with early issue detection and resolution.</p>
                </div>
                <div className="feature-step-placeholder">
                  {/* Placeholder for visualization */}
                </div>
              </div>
              
              <div className="feature-step">
                <div className="feature-step-placeholder">
                  {/* Placeholder for visualization */}
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
                  {/* Placeholder for visualization */}
                </div>
              </div>
            </div>
            
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-placeholder">
                  {/* Placeholder for visualization */}
                </div>
                <div className="feature-card-content">
                  <h3>Instant monitoring.</h3>
                  <p>Track pipeline status in real time from any device—desktop or mobile.</p>
                </div>
              </div>
              
              <div className="feature-card">
                <div className="feature-placeholder">
                  {/* Placeholder for visualization */}
                </div>
                <div className="feature-card-content">
                  <h3>Secure by design.</h3>
                  <p>Enterprise-grade security safeguards every build, test, and deploy.</p>
                </div>
              </div>
              
              <div className="feature-card">
                <div className="feature-placeholder">
                  {/* Placeholder for visualization */}
                </div>
                <div className="feature-card-content">
                  <h3>Seamless rollbacks.</h3>
                  <p>Rollback instantly to a previous state for ultimate peace of mind.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Why Developers Love Section */}
        <section className="why-developers">
          <div className="why-developers-content">
            <div className="section-header">
              <h2>Why Developers Love PipelineXR</h2>
              <p>Faster delivery cycles automate everything from code to cloud. Flexible configuration tailor pipelines for your team's needs. Enterprise grade security protect each build and deployment.</p>
              <p>Seamless team collaboration, connect developers, testers, and DevOps in one place. Cost effective, saves time, effort, and infrastructure costs.</p>
            </div>
            
            <div className="signature">
              {/* Signature placeholder */}
            </div>
          </div>
        </section>
        
        {/* Testimonials */}
        <section className="testimonials">
          <div className="testimonials-content">
            <div className="section-header">
              <h2>Trusted by Industry Leaders</h2>
              <p>Engineers choose PipelineXR for speed and reliability.</p>
            </div>
            
            <div className="testimonial-cards">
              <div className="testimonial-card">
                <p>“PipelineXR cut our deployment time by 70%. A transformative force for our DevOps.”</p>
                <div className="testimonial-author">
                  <p>Ravi Sharma</p>
                  <p>Lead Engineer, CloudNova</p>
                </div>
              </div>
              
              <div className="testimonial-card">
                <p>“Automation and insights from PipelineXR revolutionized our delivery pipeline.”</p>
                <div className="testimonial-author">
                  <p>Priya Patel</p>
                  <p>CTO, NexVision Labs</p>
                </div>
              </div>
              
              <div className="testimonial-card">
                <p>“Reliable, scalable, intelligent CI/CD. Everything just works.”</p>
                <div className="testimonial-author">
                  <p>Marcus Lee</p>
                  <p>DevOps Lead, DevVelocity</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Pricing */}
        <section className="pricing">
          <div className="pricing-content">
            <div className="section-header">
              <h2>Tailored Pricing for Every Team</h2>
              <p>Clarity. Simplicity. Value.</p>
            </div>
            
            <div className="pricing-cards">
              <div className="pricing-card">
                <h3>Starter</h3>
                <p className="price">Free</p>
                <ul>
                  <li>Single user</li>
                  <li>Essential CI/CD</li>
                  <li>Community support</li>
                </ul>
                <button 
                  className="btn btn-outline"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                  onClick={() => user ? navigate('/dashboard') : navigate('/auth')}
                >
                  {user ? 'Go to Dashboard' : 'Sign Up'}
                </button>
              </div>
              
              <div className="pricing-card popular">
                <div className="popular-badge">Most Popular</div>
                <h3>Pro</h3>
                <p className="price">$15/mo</p>
                <ul>
                  <li>Up to 10 users</li>
                  <li>Advanced workflows</li>
                  <li>Priority support</li>
                </ul>
                <button 
                  className="btn btn-primary"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                  onClick={() => user ? navigate('/dashboard') : navigate('/auth')}
                >
                  {user ? 'Go to Dashboard' : 'Compare Plans'}
                </button>
              </div>
              
              <div className="pricing-card">
                <h3>Enterprise</h3>
                <p className="price">Custom</p>
                <ul>
                  <li>Unlimited users</li>
                  <li>Dedicated manager</li>
                  <li>Custom SLA</li>
                </ul>
                <button 
                  className="btn btn-secondary"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                  onClick={() => user ? navigate('/dashboard') : navigate('/auth')}
                >
                  {user ? 'Go to Dashboard' : 'Contact Sales'}
                </button>
              </div>
            </div>
          </div>
        </section>
        
        {/* Contact Form */}
        <section className="contact">
          <div className="contact-content">
            <div className="section-header">
              <h2>Connect With Our Team</h2>
              <p>We respond within one business day.</p>
            </div>
            
            <form className="contact-form">
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input 
                  type="text" 
                  id="name" 
                  placeholder="Jane Smith"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  placeholder="jane@framer.com"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="message">Message</label>
                <textarea 
                  id="message" 
                  placeholder="Your message…"
                  rows="5"
                  onMouseEnter={handleSpeedUp}
                  onMouseLeave={handleSlowDown}
                ></textarea>
              </div>
              
              <button 
                type="submit" 
                className="btn btn-primary"
                onMouseEnter={handleSpeedUp}
                onMouseLeave={handleSlowDown}
              >
                Submit
              </button>
            </form>
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
                <a href="#home">Home</a>
                <a href="#features">Features</a>
                <a href="#documentation">Documentation</a>
              </div>
              <div className="footer-column">
                <h4>Company</h4>
                <a href="#about">About</a>
                <a href="#pricing">Pricing</a>
                <a href="#careers">Careers</a>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <a href="#blog">Blog</a>
                <a href="#api">API</a>
                <a href="#help">Help Center</a>
              </div>
              <div className="footer-column">
                <h4>Connect</h4>
                <a href="#github">GitHub</a>
                <a href="#linkedin">LinkedIn</a>
                <a href="#twitter">Twitter</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Layout>
  );
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/features" element={<Features />} />
      <Route path="/auth" element={<LoginSignup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default App;