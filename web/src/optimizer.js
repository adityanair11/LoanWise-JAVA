/**
 * Debt Payoff Acceleration Optimization engine (Avalanche & Snowball strategies).
 * Exact port of service.SimulationThread and strategy.Avalanche/SnowballStrategy (Java)
 */

const { calculateEMI } = require('./calculator');

function sortLoans(loans, strategy = 'AVALANCHE') {
  const copy = [...loans];
  if (strategy.toUpperCase() === 'SNOWBALL') {
    // Smallest balance first, then highest rate
    return copy.sort((a, b) => {
      const balA = parseFloat(a.outstanding_balance !== undefined ? a.outstanding_balance : a.balance);
      const balB = parseFloat(b.outstanding_balance !== undefined ? b.outstanding_balance : b.balance);
      const balDiff = balA - balB;
      if (Math.abs(balDiff) > 1e-6) return balDiff;
      const rateA = parseFloat(a.annual_interest_rate !== undefined ? a.annual_interest_rate : a.rate);
      const rateB = parseFloat(b.annual_interest_rate !== undefined ? b.annual_interest_rate : b.rate);
      return rateB - rateA;
    });
  } else {
    // Avalanche: Highest rate first, then highest balance
    return copy.sort((a, b) => {
      const rateA = parseFloat(a.annual_interest_rate !== undefined ? a.annual_interest_rate : a.rate);
      const rateB = parseFloat(b.annual_interest_rate !== undefined ? b.annual_interest_rate : b.rate);
      const rateDiff = rateB - rateA;
      if (Math.abs(rateDiff) > 1e-6) return rateDiff;
      const balA = parseFloat(a.outstanding_balance !== undefined ? a.outstanding_balance : a.balance);
      const balB = parseFloat(b.outstanding_balance !== undefined ? b.outstanding_balance : b.balance);
      return balB - balA;
    });
  }
}

function hasActiveLoans(list) {
  return list.some(l => l.balance > 0.001);
}

function simulatePayoff(loans, strategy = 'AVALANCHE', extraMonthlyPrepayment = 0) {
  if (!loans || loans.length === 0) {
    return {
      baselineMonths: 0,
      acceleratedMonths: 0,
      monthsSaved: 0,
      baselineInterest: 0,
      acceleratedInterest: 0,
      interestSaved: 0,
      prioritizedLoans: []
    };
  }

  // 1. Prepare Baseline State
  const baselineLoans = loans.map(l => {
    const bal = parseFloat(l.outstanding_balance !== undefined ? l.outstanding_balance : l.balance);
    const rate = parseFloat(l.annual_interest_rate !== undefined ? l.annual_interest_rate : l.rate);
    const tenure = parseInt(l.tenure_months !== undefined ? l.tenure_months : l.tenure, 10) || 12;
    return {
      name: l.loan_name,
      balance: bal,
      rate,
      monthlyRate: (rate / 100.0) / 12.0,
      regularEMI: calculateEMI(bal, rate, tenure)
    };
  });

  const maxCapMonths = 600;
  let baselineTotalInterest = 0.0;
  let baselineMonths = 0;

  while (hasActiveLoans(baselineLoans) && baselineMonths < maxCapMonths) {
    baselineMonths++;
    for (const s of baselineLoans) {
      if (s.balance > 0.001) {
        const interest = s.balance * s.monthlyRate;
        baselineTotalInterest += interest;
        const regularPayment = Math.min(s.regularEMI, s.balance + interest);
        const principalPaid = Math.max(0.0, regularPayment - interest);
        s.balance -= principalPaid;
      }
    }
  }

  // 2. Prepare Accelerated State (sorted according to strategy)
  const prioritizedLoans = sortLoans(loans, strategy);
  const acceleratedLoans = prioritizedLoans.map(l => {
    const bal = parseFloat(l.outstanding_balance !== undefined ? l.outstanding_balance : l.balance);
    const rate = parseFloat(l.annual_interest_rate !== undefined ? l.annual_interest_rate : l.rate);
    const tenure = parseInt(l.tenure_months !== undefined ? l.tenure_months : l.tenure, 10) || 12;
    return {
      name: l.loan_name,
      balance: bal,
      rate,
      monthlyRate: (rate / 100.0) / 12.0,
      regularEMI: calculateEMI(bal, rate, tenure)
    };
  });

  let acceleratedTotalInterest = 0.0;
  let acceleratedMonths = 0;

  while (hasActiveLoans(acceleratedLoans) && acceleratedMonths < maxCapMonths) {
    acceleratedMonths++;
    let freedUpEMIFromFinishedLoans = 0.0;

    // A. Normal EMI payments and accrued interest
    for (const s of acceleratedLoans) {
      if (s.balance > 0.001) {
        const interest = s.balance * s.monthlyRate;
        acceleratedTotalInterest += interest;
        const regularPayment = Math.min(s.regularEMI, s.balance + interest);
        const principalPaid = Math.max(0.0, regularPayment - interest);
        s.balance -= principalPaid;
        if (s.balance <= 0.001) {
          s.balance = 0.0;
        }
      } else {
        freedUpEMIFromFinishedLoans += s.regularEMI;
      }
    }

    // B. Extra monthly prepayment allocation according to strategy priority
    let pool = extraMonthlyPrepayment + freedUpEMIFromFinishedLoans;
    if (pool > 0.0) {
      for (const s of acceleratedLoans) {
        if (s.balance > 0.001) {
          const prepay = Math.min(pool, s.balance);
          s.balance -= prepay;
          pool -= prepay;
          if (s.balance <= 0.001) {
            s.balance = 0.0;
          }
          if (pool <= 0.001) {
            break;
          }
        }
      }
    }
  }

  const monthsSaved = Math.max(0, baselineMonths - acceleratedMonths);
  const interestSaved = Math.max(0, parseFloat((baselineTotalInterest - acceleratedTotalInterest).toFixed(2)));

  return {
    baselineMonths,
    acceleratedMonths,
    monthsSaved,
    baselineInterest: parseFloat(baselineTotalInterest.toFixed(2)),
    acceleratedInterest: parseFloat(acceleratedTotalInterest.toFixed(2)),
    interestSaved,
    prioritizedLoans
  };
}

module.exports = {
  sortLoans,
  simulatePayoff
};
