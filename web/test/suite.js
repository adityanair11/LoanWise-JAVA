const assert = require('assert');
const { calculateEMI, generateAmortizationSchedule, generateScenarioSchedule } = require('../src/calculator');
const { sortLoans, simulatePayoff } = require('../src/optimizer');

console.log('[LoanWise Web Suite] Running calculation & optimization verification tests...');

// 1. EMI Test
const emi = calculateEMI(100000, 12, 12);
assert(emi > 8880 && emi < 8890, `EMI should be approx 8884.88, got ${emi}`);
console.log('✓ Test 1: Reducing balance EMI calculation formula verified.');

// 2. Schedule Test
const schedule = generateAmortizationSchedule(100000, 12, 12);
assert.strictEqual(schedule.length, 12, 'Schedule should contain 12 installments');
assert.strictEqual(schedule[11].closingBalance, 0, 'Final closing balance should be 0');
console.log('✓ Test 2: 12-month amortization schedule generation verified.');

// 3. Scenario Test
const scenario = generateScenarioSchedule(100000, 12, 12, 1, 2000, 12);
assert(scenario.length < 12, `Extra prepayments should reduce payoff months, got ${scenario.length}`);
console.log('✓ Test 3: Scenario simulator with prepayment acceleration verified.');

// 4. Avalanche vs Snowball Sorting
const mockLoans = [
  { loan_name: 'Home Loan', outstanding_balance: 3000000, annual_interest_rate: 8.5, tenure_months: 240 },
  { loan_name: 'Personal Loan', outstanding_balance: 200000, annual_interest_rate: 13.5, tenure_months: 36 },
  { loan_name: 'Car Loan', outstanding_balance: 500000, annual_interest_rate: 9.5, tenure_months: 60 }
];

const avalancheSorted = sortLoans(mockLoans, 'AVALANCHE');
assert.strictEqual(avalancheSorted[0].loan_name, 'Personal Loan', 'Avalanche must pick highest rate first');

const snowballSorted = sortLoans(mockLoans, 'SNOWBALL');
assert.strictEqual(snowballSorted[0].loan_name, 'Personal Loan', 'Snowball must pick smallest balance first');
console.log('✓ Test 4: Strategy sorting (Avalanche & Snowball) verified.');

// 5. Payoff Simulation Test
const simResult = simulatePayoff(mockLoans, 'AVALANCHE', 10000);
assert(simResult.interestSaved > 0, 'Simulation should yield positive interest savings');
assert(simResult.monthsSaved > 0, 'Simulation should yield tenure reduction');
console.log('✓ Test 5: Full payoff acceleration simulation verified.');

console.log('\n[PASS] All 5 core web calculation tests passed successfully!\n');
