/**
 * High-precision reducing balance loan financial calculations.
 * Exact port of service.EMICalculator (Java)
 */

function calculateEMI(principal, annualRate, tenureMonths) {
  if (principal <= 0 || tenureMonths <= 0) return 0.0;
  if (annualRate <= 0.0) return principal / tenureMonths;

  const monthlyRate = (annualRate / 100.0) / 12.0;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  if (Math.abs(factor - 1.0) < 1e-9) return principal / tenureMonths;

  return (principal * monthlyRate * factor) / (factor - 1.0);
}

function generateAmortizationSchedule(principal, annualRate, tenureMonths, startDate = new Date()) {
  const schedule = [];
  if (principal <= 0 || tenureMonths <= 0) return schedule;

  const emi = calculateEMI(principal, annualRate, tenureMonths);
  const monthlyRate = (annualRate / 100.0) / 12.0;
  let currentBalance = principal;
  let installmentDate = new Date(startDate);

  for (let i = 1; i <= tenureMonths && currentBalance > 0.001; i++) {
    const opening = currentBalance;
    const interest = opening * monthlyRate;
    let principalComponent;
    let actualEmi;

    if (i === tenureMonths || (opening + interest <= emi)) {
      principalComponent = opening;
      actualEmi = principalComponent + interest;
      currentBalance = 0.0;
    } else {
      actualEmi = emi;
      principalComponent = Math.min(opening, emi - interest);
      currentBalance = Math.max(0.0, opening - principalComponent);
    }

    schedule.push({
      installmentNumber: i,
      paymentDate: installmentDate.toISOString().split('T')[0],
      openingBalance: parseFloat(opening.toFixed(2)),
      emi: parseFloat(actualEmi.toFixed(2)),
      principalPaid: parseFloat(principalComponent.toFixed(2)),
      interestPaid: parseFloat(interest.toFixed(2)),
      closingBalance: parseFloat(currentBalance.toFixed(2))
    });

    installmentDate.setMonth(installmentDate.getMonth() + 1);
  }

  return schedule;
}

function generateScenarioSchedule(principal, initialRate, revisedRate, effectiveMonth = 1, extraPrepayment = 0, originalTenure = 120, startDate = new Date()) {
  const schedule = [];
  if (principal <= 0 || originalTenure <= 0) return schedule;

  const baseEMI = calculateEMI(principal, initialRate, originalTenure);
  const effMonth = Math.max(1, effectiveMonth);
  const extraPay = Math.max(0, extraPrepayment);
  let currentBalance = principal;
  let installmentDate = new Date(startDate);
  const maxCap = Math.max(originalTenure * 3, 600);

  for (let i = 1; i <= maxCap && currentBalance > 0.001; i++) {
    const opening = currentBalance;
    const rate = (i >= effMonth) ? revisedRate : initialRate;
    const monthlyRate = (rate / 100.0) / 12.0;
    const interest = opening * monthlyRate;

    const extraThisMonth = (i >= effMonth) ? extraPay : 0.0;
    let scheduledPayment = baseEMI + extraThisMonth;

    if (scheduledPayment <= interest + 0.01) {
      scheduledPayment = interest + Math.max(500.0, baseEMI * 0.1);
    }

    let principalComponent;
    let totalPayment;

    if (opening + interest <= scheduledPayment + 0.01) {
      principalComponent = opening;
      totalPayment = principalComponent + interest;
      currentBalance = 0.0;
    } else {
      totalPayment = scheduledPayment;
      principalComponent = Math.max(0.0, totalPayment - interest);
      currentBalance = Math.max(0.0, opening - principalComponent);
    }

    schedule.push({
      installmentNumber: i,
      paymentDate: installmentDate.toISOString().split('T')[0],
      openingBalance: parseFloat(opening.toFixed(2)),
      emi: parseFloat(totalPayment.toFixed(2)),
      principalPaid: parseFloat(principalComponent.toFixed(2)),
      interestPaid: parseFloat(interest.toFixed(2)),
      closingBalance: parseFloat(currentBalance.toFixed(2))
    });

    installmentDate.setMonth(installmentDate.getMonth() + 1);
  }

  return schedule;
}

function summarizeSchedule(schedule) {
  if (!schedule || schedule.length === 0) {
    return { totalMonths: 0, totalInterest: 0, totalOutflow: 0, totalPrincipal: 0 };
  }
  let totalInterest = 0;
  let totalOutflow = 0;
  let totalPrincipal = 0;

  for (const item of schedule) {
    totalInterest += item.interestPaid;
    totalOutflow += item.emi;
    totalPrincipal += item.principalPaid;
  }

  return {
    totalMonths: schedule.length,
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    totalOutflow: parseFloat(totalOutflow.toFixed(2)),
    totalPrincipal: parseFloat(totalPrincipal.toFixed(2))
  };
}

module.exports = {
  calculateEMI,
  generateAmortizationSchedule,
  generateScenarioSchedule,
  summarizeSchedule
};
