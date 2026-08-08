// Monetisation model for Practice Coach (UK exam-prep, freemium + schools).
// Monthly, cash basis. Three academic years from launch.
//
// Every number below is an assumption, not a measurement. The point of the
// model is to show which assumptions the outcome is actually sensitive to.

const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

// Share of a year's signups landing in each month, UK exam calendar.
// Easter revision (Apr) and the exam run (May) dominate; summer is dead.
const SEASONALITY = [0.04, 0.05, 0.07, 0.05, 0.09, 0.08, 0.13, 0.18, 0.16, 0.08, 0.04, 0.03];

// Blended net revenue per consumer sale.
//   Season Pass £19.99 (60%), annual auto-renew £24.99 (35%), monthly ~£15 (5%)
//   less Stripe at 2.9% + 20p.
const MIX = [[19.99, 0.60], [24.99, 0.35], [15.00, 0.05]];
const GROSS_ARPU = MIX.reduce((a, [p, w]) => a + p * w, 0);
const NET_ARPU = GROSS_ARPU * 0.971 - 0.20;

const SCENARIOS = {
  conservative: {
    signupsY1: 3000, growth: [1, 2.0, 1.8],
    activation: 0.35, conversion: 0.04, renewal: 0.25,
    schools: [0, 5, 20], schoolPrice: 500,
  },
  base: {
    signupsY1: 10000, growth: [1, 2.5, 2.0],
    activation: 0.40, conversion: 0.06, renewal: 0.35,
    schools: [0, 15, 60], schoolPrice: 550,
  },
  optimistic: {
    signupsY1: 35000, growth: [1, 2.5, 2.0],
    activation: 0.45, conversion: 0.09, renewal: 0.45,
    schools: [0, 40, 150], schoolPrice: 650,
  },
};

// Launch is realistically ~3 months out: severity-1 fixes, accounts, sync,
// billing. Nov = month index 2 of the academic year.
const LAUNCH_MONTH_INDEX = 2;

// Infrastructure only. Excludes the founder's time entirely.
const INFRA = [500, 1200, 2500];

function run(name, s) {
  const months = [];
  let signupsY1Cumulative = 0;

  for (let y = 0; y < 3; y += 1) {
    const yearSignups = s.signupsY1 * s.growth.slice(0, y + 1).reduce((a, b) => a * b, 1);
    for (let m = 0; m < 12; m += 1) {
      const live = !(y === 0 && m < LAUNCH_MONTH_INDEX);
      // Year 1 loses the pre-launch months entirely rather than redistributing
      // them — you cannot bank a season you were not shipped for.
      const signups = live ? yearSignups * SEASONALITY[m] : 0;
      months.push({ y, m, label: `${MONTHS[m]} Y${y + 1}`, signups, activated: signups * s.activation });
      if (y === 0) signupsY1Cumulative += signups;
    }
  }

  // Conversion lands ~1 month after activation: the 30-day trial has to expire
  // before anyone is asked for money.
  for (let i = 0; i < months.length; i += 1) {
    const src = months[i - 1];
    months[i].newPaid = src ? src.activated * s.conversion : 0;
  }

  // Renewals re-enter the following year on the same seasonal shape.
  for (let y = 1; y < 3; y += 1) {
    const priorPaid = months.filter((x) => x.y === y - 1).reduce((a, x) => a + x.newPaid, 0);
    for (let m = 0; m < 12; m += 1) {
      months[y * 12 + m].renewals = priorPaid * s.renewal * SEASONALITY[m];
    }
  }
  for (const x of months) x.renewals = x.renewals || 0;

  // Schools buy for the academic year: budget releases Sep-Oct, with a tail
  // from summer decisions.
  const SCHOOL_SHAPE = [0.45, 0.25, 0.08, 0.04, 0.04, 0.02, 0.02, 0.02, 0.01, 0.01, 0.03, 0.03];
  for (const x of months) {
    x.schoolRev = s.schools[x.y] * s.schoolPrice * SCHOOL_SHAPE[x.m];
  }

  for (const x of months) {
    x.consumerRev = (x.newPaid + x.renewals) * NET_ARPU;
    x.revenue = x.consumerRev + x.schoolRev;
  }

  const years = [0, 1, 2].map((y) => {
    const rows = months.filter((x) => x.y === y);
    const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
    return {
      year: y + 1,
      signups: Math.round(sum('signups')),
      newPaid: Math.round(sum('newPaid')),
      renewals: Math.round(sum('renewals')),
      consumer: Math.round(sum('consumerRev')),
      schools: Math.round(sum('schoolRev')),
      total: Math.round(sum('revenue')),
      infra: INFRA[y],
      net: Math.round(sum('revenue') - INFRA[y]),
      peakMonth: rows.reduce((a, x) => (x.revenue > a.revenue ? x : a)),
      troughMonth: rows.slice(LAUNCH_MONTH_INDEX * (y === 0 ? 1 : 0)).reduce((a, x) => (x.revenue < a.revenue ? x : a)),
    };
  });

  return { name, years, months, signupsY1Cumulative };
}

console.log(`Blended gross per sale: £${GROSS_ARPU.toFixed(2)}  |  net of Stripe: £${NET_ARPU.toFixed(2)}\n`);

const results = {};
for (const [name, s] of Object.entries(SCENARIOS)) {
  const r = run(name, s);
  results[name] = r;
  console.log(`=== ${name.toUpperCase()} ===`);
  console.log('Yr  Signups   Paid  Renew   Consumer    Schools      Total     Net');
  for (const y of r.years) {
    console.log(
      `${y.year}   ${String(y.signups).padStart(7)} ${String(y.newPaid).padStart(6)} ${String(y.renewals).padStart(6)}`
      + `  £${String(y.consumer).padStart(8)}  £${String(y.schools).padStart(8)}  £${String(y.total).padStart(8)}  £${String(y.net).padStart(7)}`,
    );
  }
  const y3 = r.years[2];
  console.log(`   Y3 peak month: ${y3.peakMonth.label} £${Math.round(y3.peakMonth.revenue)}`
    + `  |  trough: ${y3.troughMonth.label} £${Math.round(y3.troughMonth.revenue)}`
    + `  |  peak:trough ${(y3.peakMonth.revenue / Math.max(1, y3.troughMonth.revenue)).toFixed(1)}x`);
  console.log(`   Y3 schools share of revenue: ${Math.round((y3.schools / y3.total) * 100)}%\n`);
}

// What would it take to reach £100k of consumer-only revenue in one year?
const b = SCENARIOS.base;
const perSignup = b.activation * b.conversion * NET_ARPU;
console.log(`Consumer revenue per signup (base assumptions): £${perSignup.toFixed(2)}`);
console.log(`Signups needed for £100k consumer-only: ${Math.round(100000 / perSignup).toLocaleString()}`);
console.log(`School accounts needed for £100k at £550: ${Math.ceil(100000 / 550)}`);

// Sensitivity: one variable at a time, base case, year 2 total.
console.log('\nSensitivity (Year 2 total, base case):');
const baseY2 = run('base', b).years[1].total;
const knobs = {
  'signups +50%': { ...b, signupsY1: b.signupsY1 * 1.5 },
  'activation 40%->55%': { ...b, activation: 0.55 },
  'conversion 6%->9%': { ...b, conversion: 0.09 },
  'renewal 35%->55%': { ...b, renewal: 0.55 },
  'schools 15->40': { ...b, schools: [0, 40, 60] },
};
for (const [label, s] of Object.entries(knobs)) {
  const v = run('x', s).years[1].total;
  console.log(`  ${label.padEnd(22)} £${String(v).padStart(7)}  (${v > baseY2 ? '+' : ''}${Math.round(((v - baseY2) / baseY2) * 100)}%)`);
}
