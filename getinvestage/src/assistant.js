import { dayKey, fmtPct, fmtPrice, fmtVolume, hashStr } from './useMarket';

/* ---- per-sector driver phrase pools (up / down variants) ------------- */

const POOLS = {
  chips: {
    up: [
      'AI accelerator demand keeps running ahead of supply, and the whole semi complex is catching a bid',
      'a bullish data-center capex headline is lifting chip names across the board',
      'dip buyers are rotating back into semis after the recent shakeout',
    ],
    down: [
      'traders are trimming semis on chatter about slower data-center orders',
      'profit-taking is hitting the AI trade hardest — high-beta chips give back the most',
      'an analyst note flagged inventory digestion, and chip names are wearing it',
    ],
  },
  tech: {
    up: [
      'megacap tech is doing its safe-haven-with-growth thing as yields ease',
      'a strong cloud print from a peer has the whole platform group bid',
      'buybacks and steady guidance keep the megacaps grinding higher',
    ],
    down: [
      'rate jitters are compressing long-duration tech multiples today',
      'money is rotating out of megacap tech into cyclicals for now',
      'a cautious enterprise-spending survey has platform names on the back foot',
    ],
  },
  ev: {
    up: [
      'a delivery-numbers beat narrative is pulling EV names higher',
      'an autonomy demo is doing the heavy lifting for sentiment today',
      'short covering in high-beta EV names is amplifying the move',
    ],
    down: [
      'price-cut chatter is reviving margin worries across EVs',
      'a soft China EV datapoint is weighing on the group',
      'high-beta EV names are the first sold when the tape turns cautious',
    ],
  },
  media: {
    up: [
      'ad-spend checks came in firm, and attention platforms are re-rating',
      'subscriber and engagement metrics keep surprising to the upside',
      'a content-slate win has streaming sentiment leaning positive',
    ],
    down: [
      'a soft ad-market read is dragging on media and attention names',
      'churn worries resurfaced after a competitor repriced plans',
      'the group is digesting a big run — sellers are pressing engagement names',
    ],
  },
  fin: {
    up: [
      'a steeper curve and benign credit data have financials bid',
      'capital-markets activity is picking up, which flatters fee lines',
      'risk appetite is up, and rate-sensitive financial names ride it',
    ],
    down: [
      'credit-quality chatter has traders lightening up on financials',
      'falling volatility is cooling the trading-revenue story',
      'regulatory headlines are an excuse to take profits in the group',
    ],
  },
  data: {
    up: [
      'new government and enterprise contract headlines keep the growth story hot',
      'the AI-platform narrative is doing the work — momentum funds keep adding',
      'a big-ticket deal announcement has the name squeezing higher',
    ],
    down: [
      'valuation gravity is kicking in on the highest-multiple software names',
      'a contract-timing wobble is enough excuse to sell a crowded name',
      'momentum money is stepping aside, and the air gets thin fast up here',
    ],
  },
  gig: {
    up: [
      'bookings trends read strong and take-rates are holding — the platform story compounds',
      'an autonomous-fleet partnership headline is adding an option-value kicker',
      'consumer-spend resilience keeps the gig names grinding up',
    ],
    down: [
      'a consumer-softness datapoint has discretionary platforms on the defensive',
      'driver-cost and regulatory noise are back in the headlines',
      'the group is giving back a strong run as money rotates to safety',
    ],
  },
  index: {
    up: ['broad participation — cyclicals and megacaps pulling the same direction'],
    down: ['defensive rotation under the surface — breadth is narrowing'],
  },
};

function driver(inst) {
  const pool = POOLS[inst.sector] ?? POOLS.tech;
  const variants = inst.chgPct >= 0 ? pool.up : pool.down;
  return variants[hashStr(inst.symbol + dayKey()) % variants.length];
}

/* ---- helpers ----------------------------------------------------------- */

function findMentions(text, tickers) {
  const t = text.toLowerCase();
  const hits = [];
  for (const inst of tickers) {
    const sym = inst.symbol.toLowerCase();
    const name = inst.name.toLowerCase();
    const re = new RegExp(`\\b${sym}\\b|\\b${name}\\b`, 'i');
    if (re.test(t)) hits.push(inst);
  }
  return hits;
}

function momentumNote(inst) {
  const h = inst.history;
  const recent = h.slice(-10);
  const dir = recent[recent.length - 1] - recent[0];
  if (Math.abs(dir) / recent[0] < 0.0006) return 'Momentum is flat over the last stretch of prints.';
  return dir > 0
    ? 'Short-term momentum is pointed up — recent prints keep stepping higher.'
    : 'Short-term momentum is pointed down — recent prints keep stepping lower.';
}

function rangeLine(inst) {
  const hi = inst.dayHigh ?? Math.max(...inst.history);
  const lo = inst.dayLow ?? Math.min(...inst.history);
  const vol = fmtVolume(inst.vol);
  const volPart = vol === '—' ? '' : ` on roughly ${vol} shares`;
  return `Today's range is ${fmtPrice(lo)}–${fmtPrice(hi)}${volPart}.`;
}

function describeOne(inst) {
  const dir = inst.chgPct >= 0 ? 'up' : 'down';
  return (
    `${inst.symbol} is trading at ${fmtPrice(inst.price)}, ${dir} ${fmtPct(Math.abs(inst.chgPct)).replace('+', '')} today. ` +
    `Most likely read: ${driver(inst)}. ${rangeLine(inst)} ${momentumNote(inst)}`
  );
}

/* ---- main entry ---------------------------------------------------------- */

export function generateResponse(text, ctx) {
  const { tickers, selected } = ctx;
  const q = text.toLowerCase();
  const mentions = findMentions(text, tickers);

  // Advice questions → refuse, show the neutral setup instead.
  if (/\b(should i|buy|sell|invest|worth buying|worth selling|go long|go short)\b/.test(q)) {
    const inst = mentions[0] ?? selected;
    return (
      `I don't make buy or sell calls — but here's the neutral setup so you can decide with your own rules. ` +
      describeOne(inst) +
      ' (Educational, not advice.)'
    );
  }

  // Compare two or more tickers.
  if (mentions.length >= 2) {
    const [a, b] = mentions;
    const stronger = a.chgPct >= b.chgPct ? a : b;
    const weaker = stronger === a ? b : a;
    const peA = typeof a.pe === 'number' ? a.pe : null;
    const peB = typeof b.pe === 'number' ? b.pe : null;
    let valuation = '';
    if (peA && peB) {
      const rich = peA > peB ? a : b;
      const cheap = rich === a ? b : a;
      valuation =
        ` On valuation, ${rich.symbol} trades at ${(rich === a ? peA : peB).toFixed(1)}× earnings vs ` +
        `${cheap.symbol} at ${(cheap === a ? peA : peB).toFixed(1)}× — the market is paying up for the faster story.`;
    }
    return (
      `${a.symbol} is ${fmtPct(a.chgPct)} today and ${b.symbol} is ${fmtPct(b.chgPct)}. ` +
      `${stronger.symbol} has the stronger tape right now — ${driver(stronger)}, while ${weaker.symbol} lags.` +
      valuation +
      ` I can watch both and flag whoever breaks out of today's range first.`
    );
  }

  // Single ticker.
  if (mentions.length === 1) {
    return describeOne(mentions[0]);
  }

  // Watchlist summary.
  if (/(summar|watchlist|overview|today|market)/.test(q)) {
    const green = tickers.filter((t) => t.chgPct >= 0);
    const leader = [...tickers].sort((x, y) => y.chgPct - x.chgPct)[0];
    const laggard = [...tickers].sort((x, y) => x.chgPct - y.chgPct)[0];
    const tone =
      green.length >= 9
        ? 'The tone reads risk-on — breadth is solidly green.'
        : green.length >= 6
          ? 'The tone is mixed — rotation more than conviction.'
          : 'The tone reads cautious — sellers have the majority.';
    return (
      `${green.length} of your ${tickers.length} names are green right now. ` +
      `${leader.symbol} leads at ${fmtPct(leader.chgPct)} (${driver(leader)}), ` +
      `while ${laggard.symbol} lags at ${fmtPct(laggard.chgPct)}. ${tone}`
    );
  }

  // "Why…" with no ticker → explain the selected or biggest mover.
  if (/\bwhy\b/.test(q)) {
    const mostMoved = [...tickers].sort(
      (x, y) => Math.abs(y.chgPct) - Math.abs(x.chgPct),
    )[0];
    return describeOne(selected ?? mostMoved);
  }

  return (
    `I'm watching your ${tickers.length} tickers live. Try: ` +
    `"Why is NVDA moving right now?", "Summarize my watchlist", or "Compare NVDA and AMD".`
  );
}
