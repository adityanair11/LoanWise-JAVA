/**
 * LoanWise Frontend Controller & Reactive State Manager
 * Connects semantic HTML views with Node.js / Express REST API endpoints.
 */

// State
let token = localStorage.getItem('loanwise_token') || null;
let currentUser = null;
let cachedLoans = [];

// Formatting Helpers
function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
}

// REST Client with Authorization Header
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Tab Switching
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

    tab.classList.add('active');
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    if (target) target.style.display = 'block';

    // Route trigger updates
    if (tab.dataset.tab === 'dashboard') loadDashboard();
    if (tab.dataset.tab === 'loans') loadLoans();
    if (tab.dataset.tab === 'optimizer') loadOptimizer();
    if (tab.dataset.tab === 'amortization') loadAmortization();
    if (tab.dataset.tab === 'audit') loadAuditLogs();
  });
});

// Authentication Handlers
async function checkAuthSession() {
  if (!token) {
    promptLogin();
    return;
  }
  try {
    const data = await apiFetch('/api/auth/me');
    currentUser = data.user;
    updateUserBadge();
    loadDashboard();
  } catch (err) {
    localStorage.removeItem('loanwise_token');
    token = null;
    currentUser = null;
    promptLogin();
  }
}

function updateUserBadge() {
  const badge = document.getElementById('userBadge');
  const btn = document.getElementById('authBtn');
  if (currentUser) {
    badge.textContent = `User: ${currentUser.fullName}`;
    btn.textContent = 'Sign Out';
    btn.onclick = () => {
      localStorage.removeItem('loanwise_token');
      token = null;
      currentUser = null;
      location.reload();
    };
  } else {
    badge.textContent = 'User: None';
    btn.textContent = 'Sign In';
    btn.onclick = promptLogin;
  }
}

function promptLogin() {
  document.getElementById('authModal').style.display = 'flex';
}

document.getElementById('closeAuthModalBtn').onclick = () => {
  document.getElementById('authModal').style.display = 'none';
};

document.getElementById('authTabLogin').onclick = () => {
  document.getElementById('authTabLogin').className = 'btn btn-primary';
  document.getElementById('authTabRegister').className = 'btn btn-secondary';
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
};

document.getElementById('authTabRegister').onclick = () => {
  document.getElementById('authTabLogin').className = 'btn btn-secondary';
  document.getElementById('authTabRegister').className = 'btn btn-primary';
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
};

document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  // Unit 3: Client-side RegExp validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    token = res.token;
    localStorage.setItem('loanwise_token', token);
    currentUser = res.user;
    document.getElementById('authModal').style.display = 'none';
    updateUserBadge();
    loadDashboard();
  } catch (err) {
    alert('Sign in failed: ' + err.message);
  }
};

document.getElementById('registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const monthlyIncome = parseFloat(document.getElementById('regIncome').value);
  const password = document.getElementById('regPassword').value;

  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, monthlyIncome, password })
    });
    token = res.token;
    localStorage.setItem('loanwise_token', token);
    currentUser = res.user;
    document.getElementById('authModal').style.display = 'none';
    updateUserBadge();
    loadDashboard();
  } catch (err) {
    alert('Registration failed: ' + err.message);
  }
};

// 1. Dashboard Controller
async function loadDashboard() {
  if (!currentUser) return;
  try {
    const [kpis, loansData] = await Promise.all([
      apiFetch('/api/dashboard/kpis'),
      apiFetch('/api/loans')
    ]);

    document.getElementById('kpiDebt').textContent = formatCurrency(kpis.totalDebt);
    document.getElementById('kpiAccounts').textContent = kpis.activeCount;
    document.getElementById('kpiEmi').textContent = formatCurrency(kpis.monthlyCommitment);
    document.getElementById('kpiIncome').textContent = formatCurrency(kpis.monthlyIncome);
    document.getElementById('kpiDti').textContent = `${kpis.dti}%`;

    const badge = document.getElementById('kpiDtiBadge');
    badge.textContent = kpis.dtiClassification;
    if (kpis.dti < 36) badge.className = 'badge-pill badge-green';
    else if (kpis.dti <= 50) badge.className = 'badge-pill badge-orange';
    else badge.className = 'badge-pill badge-red';

    cachedLoans = loansData.loans || [];
    renderDashboardTable(cachedLoans.filter(l => l.loan_status === 'ACTIVE' && l.outstanding_balance > 0));
  } catch (err) {
    console.error('[Dashboard Error]', err);
  }
}

function renderDashboardTable(loans) {
  const tbody = document.getElementById('dashboardLoansTbody');
  if (loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 18px;">No active loans on record.</td></tr>`;
    return;
  }
  tbody.innerHTML = loans.map(l => `
    <tr>
      <td><strong>#${l.loan_id}</strong></td>
      <td><strong>${l.loan_name}</strong></td>
      <td>${l.lender_name}</td>
      <td><span class="badge-pill badge-green" style="background: #eef2ff; color: #4f46e5; border-color: #c7d2fe;">${l.loan_type}</span></td>
      <td class="text-right">${formatCurrency(l.principal_amount)}</td>
      <td class="text-right"><strong>${formatCurrency(l.outstanding_balance)}</strong></td>
      <td class="text-right">${l.annual_interest_rate}%</td>
      <td>${l.tenure_months} mo</td>
      <td class="text-right"><strong>${formatCurrency(calculateEMI(l.outstanding_balance, l.annual_interest_rate, l.tenure_months))}</strong></td>
    </tr>
  `).join('');
}

document.getElementById('refreshKpisBtn').onclick = loadDashboard;

// Client side calculation helper
function calculateEMI(principal, annualRate, tenureMonths) {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRate <= 0) return principal / tenureMonths;
  const r = (annualRate / 100.0) / 12.0;
  const f = Math.pow(1 + r, tenureMonths);
  return (principal * r * f) / (f - 1);
}

// 2. Loans Controller
async function loadLoans() {
  try {
    const data = await apiFetch('/api/loans');
    cachedLoans = data.loans || [];
    const tbody = document.getElementById('loansTableTbody');
    if (cachedLoans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px;">No loan accounts registered.</td></tr>`;
      return;
    }
    tbody.innerHTML = cachedLoans.map(l => `
      <tr>
        <td>#${l.loan_id}</td>
        <td><strong>${l.loan_name}</strong></td>
        <td>${l.lender_name}</td>
        <td>${l.loan_type}</td>
        <td class="text-right">${formatCurrency(l.principal_amount)}</td>
        <td class="text-right"><strong>${formatCurrency(l.outstanding_balance)}</strong></td>
        <td class="text-right">${l.annual_interest_rate}%</td>
        <td>${l.annual_rate_type}</td>
        <td>${l.tenure_months} mo</td>
        <td><span class="badge-pill ${l.loan_status === 'ACTIVE' ? 'badge-green' : 'badge-red'}">${l.loan_status}</span></td>
        <td>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditLoan(${l.loan_id})">Edit</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deleteLoan(${l.loan_id}, '${l.loan_name}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// Add/Edit Loan Modal
const loanModal = document.getElementById('loanModal');
document.getElementById('openAddLoanModalBtn').onclick = () => {
  document.getElementById('loanModalId').value = '';
  document.getElementById('loanModalTitle').textContent = 'Add New Loan Facility';
  document.getElementById('loanForm').reset();
  loanModal.style.display = 'flex';
};

document.getElementById('closeLoanModalBtn').onclick = () => loanModal.style.display = 'none';
document.getElementById('cancelLoanModalBtn').onclick = () => loanModal.style.display = 'none';

window.openEditLoan = (loanId) => {
  const loan = cachedLoans.find(l => l.loan_id === loanId);
  if (!loan) return;
  document.getElementById('loanModalId').value = loan.loan_id;
  document.getElementById('loanModalTitle').textContent = `Edit Loan #${loan.loan_id}: ${loan.loan_name}`;
  document.getElementById('loanModalName').value = loan.loan_name;
  document.getElementById('loanModalLender').value = loan.lender_name;
  document.getElementById('loanModalType').value = loan.loan_type;
  document.getElementById('loanModalPrincipal').value = loan.principal_amount;
  document.getElementById('loanModalBalance').value = loan.outstanding_balance;
  document.getElementById('loanModalRate').value = loan.annual_interest_rate;
  document.getElementById('loanModalRateType').value = loan.annual_rate_type || 'FIXED';
  document.getElementById('loanModalTenure').value = loan.tenure_months;
  loanModal.style.display = 'flex';
};

document.getElementById('loanForm').onsubmit = async (e) => {
  e.preventDefault();
  const loanId = document.getElementById('loanModalId').value;
  const payload = {
    loanName: document.getElementById('loanModalName').value.trim(),
    lenderName: document.getElementById('loanModalLender').value.trim(),
    loanType: document.getElementById('loanModalType').value,
    principalAmount: parseFloat(document.getElementById('loanModalPrincipal').value),
    outstandingBalance: parseFloat(document.getElementById('loanModalBalance').value),
    annualInterestRate: parseFloat(document.getElementById('loanModalRate').value),
    annualRateType: document.getElementById('loanModalRateType').value,
    tenureMonths: parseInt(document.getElementById('loanModalTenure').value, 10)
  };

  try {
    if (loanId) {
      await apiFetch(`/api/loans/${loanId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/loans', { method: 'POST', body: JSON.stringify(payload) });
    }
    loanModal.style.display = 'none';
    loadLoans();
    loadDashboard();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
};

window.deleteLoan = async (loanId, loanName) => {
  if (!confirm(`Are you sure you want to delete "${loanName}"?`)) return;
  try {
    await apiFetch(`/api/loans/${loanId}`, { method: 'DELETE' });
    loadLoans();
    loadDashboard();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
};

// Prepayment Modal
const prepayModal = document.getElementById('prepayModal');
document.getElementById('openPrepayModalBtn').onclick = () => {
  const select = document.getElementById('prepayLoanSelect');
  select.innerHTML = cachedLoans
    .filter(l => l.loan_status === 'ACTIVE' && l.outstanding_balance > 0)
    .map(l => `<option value="${l.loan_id}">${l.loan_name} (Bal: ${formatCurrency(l.outstanding_balance)})</option>`)
    .join('');
  if (select.children.length === 0) {
    alert('No active loans available for prepayment.');
    return;
  }
  prepayModal.style.display = 'flex';
};

document.getElementById('closePrepayModalBtn').onclick = () => prepayModal.style.display = 'none';
document.getElementById('cancelPrepayModalBtn').onclick = () => prepayModal.style.display = 'none';

document.getElementById('prepayForm').onsubmit = async (e) => {
  e.preventDefault();
  const loanId = parseInt(document.getElementById('prepayLoanSelect').value, 10);
  const amount = parseFloat(document.getElementById('prepayAmountInput').value);
  const strategy = document.getElementById('prepayStrategySelect').value;
  const notes = document.getElementById('prepayNotesInput').value;

  try {
    const res = await apiFetch('/api/prepayments', {
      method: 'POST',
      body: JSON.stringify({ loanId, amount, strategy, notes })
    });
    alert(`Prepayment of ${formatCurrency(amount)} processed successfully!`);
    prepayModal.style.display = 'none';
    loadLoans();
    loadDashboard();
  } catch (err) {
    alert('Prepayment failed: ' + err.message);
  }
};

// 3. Payoff Optimizer Controller
async function loadOptimizer() {
  document.getElementById('optBudgetInput').oninput = (e) => {
    document.getElementById('optBudgetSlider').value = e.target.value;
  };
  document.getElementById('optBudgetSlider').oninput = (e) => {
    document.getElementById('optBudgetInput').value = e.target.value;
  };
}

document.getElementById('runSimulationBtn').onclick = async () => {
  const strategy = document.querySelector('input[name="optStrategy"]:checked').value;
  const extraBudget = parseFloat(document.getElementById('optBudgetInput').value) || 0;

  try {
    const res = await apiFetch('/api/optimizer/simulate', {
      method: 'POST',
      body: JSON.stringify({ strategy, extraBudget })
    });

    document.getElementById('optInterestSaved').textContent = formatCurrency(res.interestSaved);
    document.getElementById('optMonthsSaved').textContent = `${res.monthsSaved} Months`;

    const tbody = document.getElementById('optPriorityTbody');
    tbody.innerHTML = res.prioritizedLoans.map((l, i) => `
      <tr>
        <td><strong style="color: var(--accent-indigo);">#${i + 1}</strong></td>
        <td><strong>${l.loan_name}</strong></td>
        <td class="text-right">${formatCurrency(l.outstanding_balance)}</td>
        <td class="text-right"><strong>${l.annual_interest_rate}%</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    alert('Simulation error: ' + err.message);
  }
};

// 4. Amortization Schedule & Scenario Simulator Controller
async function loadAmortization() {
  const select = document.getElementById('amortLoanSelect');
  if (cachedLoans.length === 0) {
    const data = await apiFetch('/api/loans');
    cachedLoans = data.loans || [];
  }
  select.innerHTML = cachedLoans.map(l => `<option value="${l.loan_id}">${l.loan_name} (@${l.annual_interest_rate}%)</option>`).join('');

  if (select.value) {
    fetchAmortization(select.value);
  }
  select.onchange = () => fetchAmortization(select.value);
}

let activeAmortSchedule = [];

async function fetchAmortization(loanId) {
  try {
    const res = await apiFetch(`/api/amortization/${loanId}`);
    activeAmortSchedule = res.schedule;
    document.getElementById('scenarioRateInput').value = res.loan.annual_interest_rate;
    document.getElementById('scenarioPrepayInput').value = 0;
    document.getElementById('scenarioMonthInput').value = 1;

    document.getElementById('amortBaselineStats').textContent =
      `Baseline: ${res.summary.totalMonths} months | Interest: ${formatCurrency(res.summary.totalInterest)} | Total Outflow: ${formatCurrency(res.summary.totalOutflow)}`;
    document.getElementById('amortScenarioStats').textContent = 'Scenario: Baseline active (no adjustments)';
    document.getElementById('amortDeltaBadge').textContent = 'Baseline Active';
    document.getElementById('amortDeltaBadge').className = 'badge-pill badge-green';

    renderScheduleTable(res.schedule);
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('applyScenarioBtn').onclick = async () => {
  const loanId = document.getElementById('amortLoanSelect').value;
  const extraPrepayment = parseFloat(document.getElementById('scenarioPrepayInput').value) || 0;
  const revisedRate = parseFloat(document.getElementById('scenarioRateInput').value);
  const effectiveMonth = parseInt(document.getElementById('scenarioMonthInput').value, 10) || 1;

  try {
    const res = await apiFetch('/api/amortization/scenario', {
      method: 'POST',
      body: JSON.stringify({ loanId, extraPrepayment, revisedRate, effectiveMonth })
    });

    activeAmortSchedule = res.schedule;
    document.getElementById('amortBaselineStats').textContent =
      `Baseline: ${res.baselineSummary.totalMonths} months | Interest: ${formatCurrency(res.baselineSummary.totalInterest)}`;
    document.getElementById('amortScenarioStats').textContent =
      `Scenario: ${res.scenarioSummary.totalMonths} months | Interest: ${formatCurrency(res.scenarioSummary.totalInterest)}`;

    const badge = document.getElementById('amortDeltaBadge');
    if (res.monthsSaved > 0 && res.interestSaved > 0) {
      badge.textContent = `✓ Saves ${res.monthsSaved} mos and ${formatCurrency(res.interestSaved)} in interest`;
      badge.className = 'badge-pill badge-green';
    } else if (res.interestSaved < 0) {
      badge.textContent = `⚠ Adds ${formatCurrency(-res.interestSaved)} in interest`;
      badge.className = 'badge-pill badge-red';
    } else {
      badge.textContent = 'Scenario Active';
      badge.className = 'badge-pill badge-orange';
    }

    renderScheduleTable(res.schedule);
  } catch (err) {
    alert('Scenario calculation error: ' + err.message);
  }
};

document.getElementById('resetScenarioBtn').onclick = () => {
  const loanId = document.getElementById('amortLoanSelect').value;
  if (loanId) fetchAmortization(loanId);
};

function renderScheduleTable(schedule) {
  const tbody = document.getElementById('amortScheduleTbody');
  tbody.innerHTML = schedule.map(row => `
    <tr>
      <td>#${row.installmentNumber}</td>
      <td>${row.paymentDate}</td>
      <td class="text-right">${formatCurrency(row.openingBalance)}</td>
      <td class="text-right"><strong>${formatCurrency(row.emi)}</strong></td>
      <td class="text-right">${formatCurrency(row.principalPaid)}</td>
      <td class="text-right">${formatCurrency(row.interestPaid)}</td>
      <td class="text-right">${formatCurrency(row.closingBalance)}</td>
    </tr>
  `).join('');
}

// Export CSV
document.getElementById('amortExportCsvBtn').onclick = () => {
  if (activeAmortSchedule.length === 0) return alert('No schedule available to export.');
  let csv = 'Installment,Due Date,Opening Balance,EMI,Principal,Interest,Closing Balance\n';
  activeAmortSchedule.forEach(r => {
    csv += `${r.installmentNumber},${r.paymentDate},${r.openingBalance},${r.emi},${r.principalPaid},${r.interestPaid},${r.closingBalance}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'LoanWise_Amortization_Schedule.csv';
  a.click();
};

// 5. Audit Ledger Controller
async function loadAuditLogs() {
  try {
    const res = await apiFetch('/api/audit-logs');
    const tbody = document.getElementById('auditTbody');
    tbody.innerHTML = res.logs.map(log => `
      <tr>
        <td>#${log.log_id}</td>
        <td>${log.loan_id ? `#${log.loan_id}` : '—'}</td>
        <td><span class="badge-pill badge-orange" style="background: #f1f5f9; color: #334155;">${log.action_type}</span></td>
        <td>${log.action_details}</td>
        <td style="color: var(--text-muted); font-size: 12px;">${new Date(log.action_timestamp).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('refreshAuditBtn').onclick = loadAuditLogs;

// Bootstrap
window.onload = checkAuthSession;
