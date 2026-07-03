import { GithubLogo, LinkedinLogo, XLogo } from '@phosphor-icons/react';
import { Logo } from './Logo';

const COLUMNS = [
  {
    title: 'Product',
    links: ['Dashboard', 'Markets', 'Portfolio', 'Watchlist', 'Pricing'],
    hrefs: ['#dashboard', '#markets', '#portfolio', '#watchlist', '#pricing'],
  },
  {
    title: 'Company',
    links: ['About', 'Careers', 'Press', 'Contact'],
    hrefs: ['#', '#', '#', '#'],
  },
  {
    title: 'Resources',
    links: ['Market news', 'Help center', 'API docs', 'Status'],
    hrefs: ['#news', '#', '#', '#'],
  },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <a className="brand" href="#dashboard" style={{ fontSize: 18 }}>
            <Logo />
            <span className="brand-name">
              Get<em>Investage</em>
            </span>
          </a>
          <p className="footer-blurb">
            Professional market intelligence — live quotes, candlestick analytics, portfolio
            performance and financial news in one workspace.
          </p>
          <div className="footer-socials">
            <a className="icon-btn" href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="GetInvestage on X">
              <XLogo size={18} />
            </a>
            <a className="icon-btn" href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GetInvestage on GitHub">
              <GithubLogo size={18} />
            </a>
            <a className="icon-btn" href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="GetInvestage on LinkedIn">
              <LinkedinLogo size={18} />
            </a>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4>{col.title}</h4>
            <ul className="footer-links">
              {col.links.map((label, i) => (
                <li key={label}>
                  <a href={col.hrefs[i]}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="footer-bottom">
        <span>© 2026 GetInvestage. All rights reserved.</span>
        <span>Market data may be delayed. Nothing here is investment advice.</span>
      </div>
    </footer>
  );
}
