import React from 'react';
import { FaRocket, FaBolt, FaBuilding, FaCheck } from 'react-icons/fa';

const PricingCard = ({ plan, price, description, features, isPopular, ctaText, icon }) => {
  const getIcon = () => {
    switch (icon) {
      case 'rocket':
        return <FaRocket className="text-blue-400 text-xs" />;
      case 'bolt':
        return <FaBolt className="text-blue-400 text-xs" />;
      case 'building':
        return <FaBuilding className="text-indigo-400 text-xs" />;
      default:
        return <FaRocket className="text-blue-400 text-xs" />;
    }
  };

  return (
    <div
      className={`pricing-card ${isPopular ? 'popular-card' : ''}`}
      style={{
        position: 'relative',
        height: '100%',
      }}
    >
      {isPopular && (
        <div className="pricing-badge">
          MOST POPULAR
        </div>
      )}

      <div className="flex items-center mb-4">
        <div className={`icon-circle ${isPopular ? 'popular-icon' : ''}`}>
          {getIcon()}
        </div>
        <h3 className="ml-3 text-xl text-white">{plan}</h3>
      </div>

      <div className="mt-2 mb-6">
        <div className="flex items-baseline">
          <span className="text-4xl font-light text-white">${price}</span>
          <span className="text-sm text-white/60 ml-2">/month</span>
        </div>
        <p className="text-white/60 text-sm mt-1">{description}</p>
      </div>

      <div className="card-divider w-full mb-6"></div>

      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center text-white/80 text-sm">
            <FaCheck className="text-blue-400 mr-3" style={{ minWidth: '16px' }} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        <button
          className={`w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
            isPopular
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
          }`}
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
};

export default PricingCard;
