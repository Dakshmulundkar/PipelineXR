import React from 'react';
import { FaBrain, FaShieldAlt, FaBolt, FaPython, FaJava, FaCode, FaCheck, FaProjectDiagram, FaSlidersH } from 'react-icons/fa';
import { SiJavascript } from 'react-icons/si';

const FeaturesBento = () => {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 pb-24">
      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="w-full md:w-1/3 glass-effect bg-white/10 rounded-2xl p-8 border border-white/10">
          <div className="icon-circle mb-4">
            <FaBrain className="text-blue-400" />
          </div>
          <h3 className="text-2xl text-white mb-3 font-light">Advanced AI Models</h3>
          <p className="text-white/70">Access state-of-the-art language models trained on diverse datasets for optimal performance.</p>
        </div>

        <div className="w-full md:w-2/3 glass-effect bg-white/5 rounded-2xl p-8 border border-white/10 flex flex-col md:flex-row items-center">
          <div className="flex-1 mb-6 md:mb-0 md:mr-6">
            <h3 className="text-2xl text-white mb-3 font-light">Multi-modal Capabilities</h3>
            <p className="text-white/70">Process and generate content across text, images, and structured data with a single unified API.</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center text-white/80 text-sm">
                <FaCheck className="text-blue-400 mr-3" style={{ minWidth: '16px' }} />
                <span>Natural language processing</span>
              </li>
              <li className="flex items-center text-white/80 text-sm">
                <FaCheck className="text-blue-400 mr-3" style={{ minWidth: '16px' }} />
                <span>Image generation and analysis</span>
              </li>
              <li className="flex items-center text-white/80 text-sm">
                <FaCheck className="text-blue-400 mr-3" style={{ minWidth: '16px' }} />
                <span>Structured data extraction</span>
              </li>
            </ul>
          </div>
          <div className="w-full md:w-64 h-48 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
            <FaProjectDiagram className="text-5xl text-white/40" />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row-reverse gap-6 mb-6">
        <div className="w-full md:w-1/3 glass-effect bg-white/10 rounded-2xl p-8 border border-white/10">
          <div className="icon-circle mb-4">
            <FaShieldAlt className="text-indigo-400" />
          </div>
          <h3 className="text-2xl text-white mb-3 font-light">Enterprise Security</h3>
          <p className="text-white/70">End-to-end encryption, compliance certifications, and secure data handling for sensitive applications.</p>
        </div>

        <div className="w-full md:w-2/3 glass-effect bg-white/5 rounded-2xl p-8 border border-white/10 flex flex-col md:flex-row items-center">
          <div className="flex-1 mb-6 md:mb-0 md:mr-6">
            <h3 className="text-2xl text-white mb-3 font-light">Customizable Training</h3>
            <p className="text-white/70">Fine-tune models on your proprietary data to create domain-specific AI solutions that match your exact needs.</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-xl font-light text-white">10x</div>
                <div className="text-xs text-white/60 mt-1">Performance</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-xl font-light text-white">95%</div>
                <div className="text-xs text-white/60 mt-1">Accuracy</div>
              </div>
            </div>
          </div>
          <div className="w-full md:w-64 h-48 bg-gradient-to-br from-indigo-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
            <FaSlidersH className="text-5xl text-white/40" />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3 glass-effect bg-white/10 rounded-2xl p-8 border border-white/10">
          <div className="icon-circle mb-4">
            <FaBolt className="text-blue-400" />
          </div>
          <h3 className="text-2xl text-white mb-3 font-light">Lightning Fast</h3>
          <p className="text-white/70">High-performance infrastructure with global edge deployment for minimal latency responses.</p>
        </div>

        <div className="w-full md:w-2/3 glass-effect bg-white/5 rounded-2xl p-8 border border-white/10">
          <h3 className="text-2xl text-white mb-3 font-light">Seamless Integration</h3>
          <p className="text-white/70 mb-6">Connect with your existing tools and workflows through our comprehensive API and SDK ecosystem.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg flex flex-col items-center justify-center">
              <FaPython className="text-2xl text-white/70 mb-2" />
              <span className="text-sm text-white/60">Python</span>
            </div>
            <div className="p-4 bg-white/5 rounded-lg flex flex-col items-center justify-center">
              <SiJavascript className="text-2xl text-white/70 mb-2" />
              <span className="text-sm text-white/60">JavaScript</span>
            </div>
            <div className="p-4 bg-white/5 rounded-lg flex flex-col items-center justify-center">
              <FaJava className="text-2xl text-white/70 mb-2" />
              <span className="text-sm text-white/60">Java</span>
            </div>
            <div className="p-4 bg-white/5 rounded-lg flex flex-col items-center justify-center">
              <FaCode className="text-2xl text-white/70 mb-2" />
              <span className="text-sm text-white/60">REST API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturesBento;
