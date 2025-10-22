import React from 'react';
import WebGLBackground from './WebGLBackground';
import FeaturesBento from './FeaturesBento';
import PricingCard from './PricingCard';
import '../../assets/pricing/Pricing.css';

const PricingSection = () => {
  const pricingPlans = [
    {
      plan: 'Starter',
      price: 19,
      description: 'Perfect for individuals and small projects',
      features: [
        '1 million tokens/month',
        '5 custom AI models',
        'Basic API access',
        'Email support',
      ],
      icon: 'rocket',
      ctaText: 'Start Free Trial',
      isPopular: false,
    },
    {
      plan: 'Professional',
      price: 49,
      description: 'For teams with advanced AI needs',
      features: [
        '10 million tokens/month',
        '20 custom AI models',
        'Advanced API access',
        'Priority support',
      ],
      icon: 'bolt',
      ctaText: 'Get Started',
      isPopular: true,
    },
    {
      plan: 'Enterprise',
      price: 199,
      description: 'For organizations with advanced requirements',
      features: [
        'Unlimited tokens',
        'Unlimited custom AI models',
        'Full API ecosystem',
        '24/7 dedicated support',
      ],
      icon: 'building',
      ctaText: 'Contact Sales',
      isPopular: false,
    },
  ];

  return (
    <div className="pricing-page">
      <WebGLBackground />

      <div className="fixed inset-0 z-10 bg-black/40 pointer-events-none"></div>

      <div className="relative z-20 w-full min-h-screen">
        <div className="w-full max-w-6xl mx-auto text-center py-16 px-4">
          <h1 className="pricing-title gradient-text bg-gradient-to-r from-white/70 via-blue-300/60 to-indigo-400/60">
            Flexible AI Solutions
          </h1>
          <p className="mt-4 text-base md:text-lg text-white/70 max-w-2xl mx-auto">
            Choose the plan that works for your workflow. All plans include core features with flexible scaling options.
          </p>
        </div>

        <FeaturesBento />

        <div className="w-full max-w-6xl mx-auto px-4 pb-24">
          <h2 className="text-3xl md:text-4xl text-white text-center mb-12 font-light">Choose Your Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, index) => (
              <PricingCard key={index} {...plan} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingSection;
