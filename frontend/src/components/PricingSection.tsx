import { Check } from '@phosphor-icons/react';

const TIERS = [
  {
    tier: 'Starter',
    price: 'Free',
    per: '',
    desc: 'Everything you need to follow the market.',
    features: ['Live quotes & candlestick charts', 'Watchlist up to 15 symbols', 'Daily market news', 'Light & dark themes'],
    cta: 'Get started',
    featured: false,
  },
  {
    tier: 'Pro',
    price: '$9',
    per: '/mo',
    desc: 'For active investors who want depth.',
    features: ['Unlimited watchlists & screeners', 'Portfolio analytics & P/L history', 'Real-time market alerts', 'AI research assistant (coming soon)'],
    cta: 'Start 14-day trial',
    featured: true,
  },
  {
    tier: 'Desk',
    price: '$29',
    per: '/mo',
    desc: 'Team workspace for research desks.',
    features: ['Everything in Pro', 'Shared portfolios & notes', 'API access & data export', 'Priority support'],
    cta: 'Contact sales',
    featured: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="section">
      <span className="eyebrow">Pricing</span>
      <h2 className="section-title">Simple plans, professional tools</h2>
      <p className="section-sub">Start free. Upgrade when your research demands more.</p>

      <div className="pricing-grid">
        {TIERS.map((t) => (
          <div
            key={t.tier}
            className={`glass price-card hover-lift${t.featured ? ' g-border' : ''}`}
            style={{ position: 'relative' }}
          >
            {t.featured && <span className="price-badge">Most popular</span>}
            <span className="price-tier">{t.tier}</span>
            <div className="price-amount num">
              {t.price}
              {t.per && <span>{t.per}</span>}
            </div>
            <p className="price-desc">{t.desc}</p>
            <ul className="price-features">
              {t.features.map((f) => (
                <li key={f}>
                  <Check size={15} weight="bold" /> {f}
                </li>
              ))}
            </ul>
            <a
              href="#dashboard"
              className={`btn price-cta ${t.featured ? 'btn-primary' : 'btn-ghost'}`}
            >
              {t.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
