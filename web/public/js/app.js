/**
 * LoanWise Frontend Controller & Reactive State Manager
 * Modern Fintech Design System with Chart.js Analytics & Real-Time Filtering
 * Symbiosis International (Deemed University)
 */

// Global Application State
let token = localStorage.getItem('loanwise_token') || null;
let currentUser = null;
let cachedLoans = [];
let cachedAuditLogs = [];
let activeAmortSchedule = [];

// Chart.js Instance References
let debtDonutChartInstance = null;
let optimizerChartInstance = null;
let amortCurveChartInstance = null;

// Active Filter States
let activeLoansCategoryFilter = 'ALL';
let activeAuditActionFilter = 'ALL';

// ==========================================================================
// Formatting & Utility Helpers
// ==========================================================================

function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
}

function calculateEMI(principal, annualRate, tenureMonths) {
  const p = parseFloat(principal) || 0;
  const rate = parseFloat(annualRate) || 0;
  const n = parseInt(tenureMonths, 10) || 0;

  if (p <= 0 || n <= 0) return 0;
  if (rate <= 0) return p / n;

  const r = (rate / 100.0) / 12.0;
  const factor = Math.pow(1 + r, n);
  return (p * r * factor) / (factor - 1);
}

// ==========================================================================
// Floating Toast Notification System (Replaces Native Alert Dialogs)
// ==========================================================================

function showToast(type = 'info', title = 'Notification', message = '') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="flex-shrink: 0; padding-top: 1px;">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0 2px;" title="Dismiss" onclick="this.parentElement.remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  }, 4200);
}

// ==========================================================================
// REST API Client
// ==========================================================================

async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Server returned HTTP ${res.status}`);
  }
  return data;
}

// ==========================================================================
// Semantic Tab Switching Navigation
// ==========================================================================

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

    tab.classList.add('active');
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    if (target) target.style.display = 'block';

    // Route triggers
    if (tab.dataset.tab === 'dashboard') loadDashboard();
    if (tab.dataset.tab === 'loans') loadLoans();
    if (tab.dataset.tab === 'optimizer') loadOptimizer();
    if (tab.dataset.tab === 'amortization') loadAmortization();
    if (tab.dataset.tab === 'audit') loadAuditLogs();
  });
});

// ==========================================================================
// Authentication Controller
// ==========================================================================

async function checkAuthSession() {
  if (!token) {
    updateUserBadge();
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
    updateUserBadge();
    promptLogin();
  }
}

function updateUserBadge() {
  const nameLabel = document.getElementById('userNameLabel');
  const avatar = document.getElementById('userAvatar');
  const btnText = document.getElementById('authBtnText');
  const btn = document.getElementById('authBtn');

  if (currentUser) {
    if (nameLabel) nameLabel.textContent = currentUser.fullName;
    if (avatar) avatar.textContent = (currentUser.fullName || 'U').charAt(0).toUpperCase();
    if (btnText) btnText.textContent = 'Sign Out';
    if (btn) {
      btn.onclick = () => {
        localStorage.removeItem('loanwise_token');
        token = null;
        currentUser = null;
        showToast('info', 'Signed Out', 'You have been safely signed out of LoanWise.');
        setTimeout(() => location.reload(), 500);
      };
    }
  } else {
    if (nameLabel) nameLabel.textContent = 'Sign In to Access';
    if (avatar) avatar.textContent = '?';
    if (btnText) btnText.textContent = 'Sign In';
    if (btn) {
      btn.onclick = promptLogin;
    }
  }
}

function promptLogin() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'flex';
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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('error', 'Validation Error', 'Please enter a valid email address.');
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
    showToast('success', 'Authentication Successful', `Welcome back, ${currentUser.fullName}!`);
    loadDashboard();
  } catch (err) {
    showToast('error', 'Sign In Failed', err.message);
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
    showToast('success', 'Account Registered', `Welcome to LoanWise, ${currentUser.fullName}!`);
    loadDashboard();
  } catch (err) {
    showToast('error', 'Registration Failed', err.message);
  }
};

// ==========================================================================
// 1. Dashboard Controller & Donut Chart Visualization
// ==========================================================================

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
    if (kpis.dti < 36) {
      badge.className = 'badge-pill badge-green';
    } else if (kpis.dti <= 50) {
      badge.className = 'badge-pill badge-orange';
    } else {
      badge.className = 'badge-pill badge-red';
    }

    cachedLoans = loansData.loans || [];
    filterAndRenderDashboardLoans();
    renderDebtDonutChart(cachedLoans.filter(l => l.loan_status === 'ACTIVE' && l.outstanding_balance > 0));
  } catch (err) {
    console.error('[Dashboard Error]', err);
    showToast('error', 'Dashboard Load Failed', err.message);
  }
}

function filterAndRenderDashboardLoans() {
  const searchTerm = (document.getElementById('dashboardLoanSearch')?.value || '').toLowerCase().trim();
  const activeLoans = cachedLoans.filter(l => l.loan_status === 'ACTIVE' && l.outstanding_balance > 0);

  const filtered = activeLoans.filter(l => {
    if (!searchTerm) return true;
    return (
      (l.loan_name && l.loan_name.toLowerCase().includes(searchTerm)) ||
      (l.lender_name && l.lender_name.toLowerCase().includes(searchTerm)) ||
      (l.loan_type && l.loan_type.toLowerCase().includes(searchTerm))
    );
  });

  renderDashboardTable(filtered);
}

function renderDashboardTable(loans) {
  const tbody = document.getElementById('dashboardLoansTbody');
  if (!tbody) return;

  if (loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">No active loans found matching current search.</td></tr>`;
    return;
  }

  tbody.innerHTML = loans.map(l => {
    const emi = calculateEMI(l.outstanding_balance, l.annual_interest_rate, l.tenure_months);
    return `
      <tr>
        <td><strong style="color: var(--text-muted); font-family: var(--font-mono);">#${l.loan_id}</strong></td>
        <td><strong style="color: var(--text-main);">${l.loan_name}</strong></td>
        <td style="color: var(--text-muted);">${l.lender_name}</td>
        <td><span class="badge-pill badge-indigo">${l.loan_type}</span></td>
        <td class="text-right" style="font-family: var(--font-mono);">${formatCurrency(l.principal_amount)}</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-rose);">${formatCurrency(l.outstanding_balance)}</td>
        <td class="text-right" style="font-family: var(--font-mono);">${l.annual_interest_rate}%</td>
        <td style="color: var(--text-muted);">${l.tenure_months} mo</td>
        <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary);">${formatCurrency(emi)}</td>
      </tr>
    `;
  }).join('');
}

// Real-Time Search for Dashboard Table
document.getElementById('dashboardLoanSearch')?.addEventListener('input', filterAndRenderDashboardLoans);
document.getElementById('refreshKpisBtn')?.addEventListener('click', () => {
  loadDashboard();
  showToast('info', 'Portfolio Refreshed', 'Latest loan balances and debt metrics synchronized.');
});

// Interactive Debt Exposure Donut Chart
function renderDebtDonutChart(activeLoans) {
  const canvas = document.getElementById('debtDonutChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (debtDonutChartInstance) {
    debtDonutChartInstance.destroy();
  }

  if (!activeLoans || activeLoans.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    debtDonutChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['No Active Debt'],
        datasets: [{
          data: [1],
          backgroundColor: ['#e2e8f0'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } },
          tooltip: { enabled: false }
        },
        cutout: '72%'
      }
    });
    return;
  }

  // Aggregate balance by category
  const categoryTotals = {};
  activeLoans.forEach(l => {
    const cat = l.loan_type || 'OTHER';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (parseFloat(l.outstanding_balance) || 0);
  });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  const colors = [
    '#4f46e5', // Indigo
    '#10b981', // Emerald
    '#0284c7', // Sky
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#e11d48'  // Rose
  ];

  debtDonutChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 12,
            font: { family: 'Inter', size: 11, weight: '500' },
            color: '#475569'
          }
        },
        tooltip: {
          backgroundColor: '#090d16',
          titleFont: { family: 'Inter', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: function(ctx) {
              const val = ctx.parsed;
              const total = data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${formatCurrency(val)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ==========================================================================
// 2. Loans Controller (CRUD, Filtering, Prepayment)
// ==========================================================================

async function loadLoans() {
  try {
    const data = await apiFetch('/api/loans');
    cachedLoans = data.loans || [];
    filterAndRenderLoansTable();
  } catch (err) {
    console.error(err);
    showToast('error', 'Failed to Load Loans', err.message);
  }
}

function filterAndRenderLoansTable() {
  const searchTerm = (document.getElementById('loansSearchInput')?.value || '').toLowerCase().trim();

  const filtered = cachedLoans.filter(l => {
    const matchesCategory = (activeLoansCategoryFilter === 'ALL' || l.loan_type === activeLoansCategoryFilter);
    if (!matchesCategory) return false;

    if (!searchTerm) return true;
    return (
      (l.loan_name && l.loan_name.toLowerCase().includes(searchTerm)) ||
      (l.lender_name && l.lender_name.toLowerCase().includes(searchTerm)) ||
      (l.loan_type && l.loan_type.toLowerCase().includes(searchTerm))
    );
  });

  const tbody = document.getElementById('loansTableTbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 24px;">No loan accounts found matching the active criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><strong style="color: var(--text-muted); font-family: var(--font-mono);">#${l.loan_id}</strong></td>
      <td><strong style="color: var(--text-main);">${l.loan_name}</strong></td>
      <td style="color: var(--text-muted);">${l.lender_name}</td>
      <td><span class="badge-pill badge-indigo">${l.loan_type}</span></td>
      <td class="text-right" style="font-family: var(--font-mono);">${formatCurrency(l.principal_amount)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-rose);">${formatCurrency(l.outstanding_balance)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${l.annual_interest_rate}%</td>
      <td><span style="font-size: 11px; color: var(--text-muted);">${l.annual_rate_type || 'FIXED'}</span></td>
      <td style="color: var(--text-muted);">${l.tenure_months} mo</td>
      <td><span class="badge-pill ${l.loan_status === 'ACTIVE' ? 'badge-green' : 'badge-red'}">${l.loan_status}</span></td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 6px;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="openEditLoan(${l.loan_id})">Edit</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deleteLoan(${l.loan_id}, '${l.loan_name}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Category Filter Chips
document.querySelectorAll('#tab-loans .filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#tab-loans .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeLoansCategoryFilter = chip.dataset.filter || 'ALL';
    filterAndRenderLoansTable();
  });
});

// Live Search Input for Loans
document.getElementById('loansSearchInput')?.addEventListener('input', filterAndRenderLoansTable);

// Add / Edit Loan Modal Bindings
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
  document.getElementById('loanModalTitle').textContent = `Edit Facility: ${loan.loan_name}`;
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
      showToast('success', 'Loan Updated', `Facility "${payload.loanName}" terms saved.`);
    } else {
      await apiFetch('/api/loans', { method: 'POST', body: JSON.stringify(payload) });
      showToast('success', 'Loan Created', `Facility "${payload.loanName}" registered successfully.`);
    }
    loanModal.style.display = 'none';
    loadLoans();
    loadDashboard();
  } catch (err) {
    showToast('error', 'Save Failed', err.message);
  }
};

window.deleteLoan = async (loanId, loanName) => {
  if (!confirm(`Are you sure you want to delete "${loanName}"? This action is logged to the audit ledger.`)) return;
  try {
    await apiFetch(`/api/loans/${loanId}`, { method: 'DELETE' });
    showToast('info', 'Loan Facility Removed', `"${loanName}" was successfully deleted.`);
    loadLoans();
    loadDashboard();
  } catch (err) {
    showToast('error', 'Delete Failed', err.message);
  }
};

// Prepayment Modal Bindings
const prepayModal = document.getElementById('prepayModal');
document.getElementById('openPrepayModalBtn').onclick = () => {
  const select = document.getElementById('prepayLoanSelect');
  const eligible = cachedLoans.filter(l => l.loan_status === 'ACTIVE' && l.outstanding_balance > 0);
  select.innerHTML = eligible
    .map(l => `<option value="${l.loan_id}">${l.loan_name} (Bal: ${formatCurrency(l.outstanding_balance)})</option>`)
    .join('');

  if (eligible.length === 0) {
    showToast('info', 'No Active Debt', 'No active loan accounts available for prepayment.');
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
    await apiFetch('/api/prepayments', {
      method: 'POST',
      body: JSON.stringify({ loanId, amount, strategy, notes })
    });
    showToast('success', 'Prepayment Recorded', `${formatCurrency(amount)} allocated toward principal reduction.`);
    prepayModal.style.display = 'none';
    loadLoans();
    loadDashboard();
  } catch (err) {
    showToast('error', 'Prepayment Failed', err.message);
  }
};

// ==========================================================================
// 3. Payoff Optimizer Controller & Comparison Visualizer
// ==========================================================================

async function loadOptimizer() {
  const input = document.getElementById('optBudgetInput');
  const slider = document.getElementById('optBudgetSlider');

  if (input && slider) {
    input.oninput = (e) => { slider.value = e.target.value; };
    slider.oninput = (e) => { input.value = e.target.value; };
  }
}

document.getElementById('runSimulationBtn').onclick = async () => {
  const strategy = document.querySelector('input[name="optStrategy"]:checked')?.value || 'AVALANCHE';
  const extraBudget = parseFloat(document.getElementById('optBudgetInput').value) || 0;

  try {
    const res = await apiFetch('/api/optimizer/simulate', {
      method: 'POST',
      body: JSON.stringify({ strategy, extraBudget })
    });

    document.getElementById('optInterestSaved').textContent = formatCurrency(res.interestSaved);
    document.getElementById('optMonthsSaved').textContent = `${res.monthsSaved} Months`;

    const tbody = document.getElementById('optPriorityTbody');
    if (!res.prioritizedLoans || res.prioritizedLoans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 18px;">No active loans available to optimize.</td></tr>`;
    } else {
      tbody.innerHTML = res.prioritizedLoans.map((l, i) => `
        <tr>
          <td><strong style="color: var(--accent-primary); font-family: var(--font-mono);">#${i + 1}</strong></td>
          <td><strong style="color: var(--text-main);">${l.loan_name}</strong></td>
          <td class="text-right" style="font-family: var(--font-mono);">${formatCurrency(l.outstanding_balance)}</td>
          <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-primary);">${l.annual_interest_rate}%</td>
        </tr>
      `).join('');
    }

    renderOptimizerChart(res);
    showToast('success', 'Simulation Complete', `Eliminates ${formatCurrency(res.interestSaved)} in interest over ${res.monthsSaved} months.`);
  } catch (err) {
    showToast('error', 'Simulation Error', err.message);
  }
};

function renderOptimizerChart(res) {
  const canvas = document.getElementById('optimizerCompareChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (optimizerChartInstance) {
    optimizerChartInstance.destroy();
  }

  const baselineInterest = res.baselineInterest || 0;
  const acceleratedInterest = res.acceleratedInterest || 0;

  optimizerChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Contractual Baseline', 'Accelerated Strategy'],
      datasets: [{
        label: 'Cumulative Interest Paid',
        data: [baselineInterest, acceleratedInterest],
        backgroundColor: ['#94a3b8', '#10b981'],
        borderRadius: 4,
        barPercentage: 0.55
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#090d16',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => ` Cumulative Interest: ${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (val) => '₹' + (val / 1000).toFixed(0) + 'k'
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11, weight: '600' },
            color: '#334155'
          }
        }
      }
    }
  });
}

// ==========================================================================
// 4. Amortization Schedule & Scenario Simulator Controller
// ==========================================================================

async function loadAmortization() {
  const select = document.getElementById('amortLoanSelect');
  if (cachedLoans.length === 0) {
    const data = await apiFetch('/api/loans');
    cachedLoans = data.loans || [];
  }

  select.innerHTML = cachedLoans
    .map(l => `<option value="${l.loan_id}">${l.loan_name} (@${l.annual_interest_rate}%)</option>`)
    .join('');

  if (select.value) {
    fetchAmortization(select.value);
  }
  select.onchange = () => fetchAmortization(select.value);
}

async function fetchAmortization(loanId) {
  try {
    const res = await apiFetch(`/api/amortization/${loanId}`);
    activeAmortSchedule = res.schedule || [];

    document.getElementById('scenarioRateInput').value = res.loan.annual_interest_rate;
    document.getElementById('scenarioPrepayInput').value = 0;
    document.getElementById('scenarioMonthInput').value = 1;

    document.getElementById('amortBaselineStats').textContent =
      `Baseline: ${res.summary.totalMonths} months | Interest: ${formatCurrency(res.summary.totalInterest)} | Total Outflow: ${formatCurrency(res.summary.totalOutflow)}`;
    document.getElementById('amortScenarioStats').textContent = 'Scenario: Baseline active (no adjustments applied)';

    const badge = document.getElementById('amortDeltaBadge');
    badge.textContent = 'Baseline Active';
    badge.className = 'badge-pill badge-slate';

    renderScheduleTable(res.schedule);
    renderAmortCurveChart(res.schedule);
  } catch (err) {
    console.error(err);
    showToast('error', 'Schedule Generation Failed', err.message);
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
      `Baseline: ${res.baselineSummary.totalMonths} mos | Total Interest: ${formatCurrency(res.baselineSummary.totalInterest)}`;
    document.getElementById('amortScenarioStats').textContent =
      `Scenario: ${res.scenarioSummary.totalMonths} mos | Total Interest: ${formatCurrency(res.scenarioSummary.totalInterest)}`;

    const badge = document.getElementById('amortDeltaBadge');
    if (res.monthsSaved > 0 && res.interestSaved > 0) {
      badge.textContent = `Saves ${res.monthsSaved} months and ${formatCurrency(res.interestSaved)} in interest`;
      badge.className = 'badge-pill badge-green';
    } else if (res.interestSaved < 0) {
      badge.textContent = `Adds ${formatCurrency(-res.interestSaved)} in interest`;
      badge.className = 'badge-pill badge-red';
    } else {
      badge.textContent = 'Scenario Applied';
      badge.className = 'badge-pill badge-orange';
    }

    renderScheduleTable(res.schedule);
    renderAmortCurveChart(res.schedule);
    showToast('success', 'Scenario Computed', `Schedule revised: ${res.monthsSaved} months saved.`);
  } catch (err) {
    showToast('error', 'Scenario Calculation Error', err.message);
  }
};

document.getElementById('resetScenarioBtn').onclick = () => {
  const loanId = document.getElementById('amortLoanSelect').value;
  if (loanId) fetchAmortization(loanId);
};

function renderScheduleTable(schedule) {
  const tbody = document.getElementById('amortScheduleTbody');
  if (!tbody) return;

  if (!schedule || schedule.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No installments in amortization schedule.</td></tr>`;
    return;
  }

  tbody.innerHTML = schedule.map(row => `
    <tr>
      <td><strong style="color: var(--text-muted); font-family: var(--font-mono);">#${row.installmentNumber}</strong></td>
      <td style="color: var(--text-muted);">${row.paymentDate}</td>
      <td class="text-right" style="font-family: var(--font-mono);">${formatCurrency(row.openingBalance)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: var(--text-main);">${formatCurrency(row.emi)}</td>
      <td class="text-right" style="font-family: var(--font-mono); color: var(--accent-emerald);">${formatCurrency(row.principalPaid)}</td>
      <td class="text-right" style="font-family: var(--font-mono); color: var(--accent-amber);">${formatCurrency(row.interestPaid)}</td>
      <td class="text-right" style="font-family: var(--font-mono); font-weight: 600;">${formatCurrency(row.closingBalance)}</td>
    </tr>
  `).join('');
}

function renderAmortCurveChart(schedule) {
  const canvas = document.getElementById('amortCurveChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (amortCurveChartInstance) {
    amortCurveChartInstance.destroy();
  }

  if (!schedule || schedule.length === 0) return;

  // Sample data points if schedule is long to ensure crisp rendering
  const step = Math.max(1, Math.floor(schedule.length / 40));
  const sampled = schedule.filter((_, idx) => idx % step === 0 || idx === schedule.length - 1);

  const labels = sampled.map(r => `M${r.installmentNumber}`);
  const balanceData = sampled.map(r => r.closingBalance);

  let cumulativeInterest = 0;
  const interestData = sampled.map(r => {
    cumulativeInterest += (r.interestPaid * step);
    return cumulativeInterest;
  });

  amortCurveChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Outstanding Principal',
          data: balanceData,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: sampled.length > 25 ? 0 : 3
        },
        {
          label: 'Cumulative Interest Paid',
          data: interestData,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.25,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, font: { family: 'Inter', size: 11, weight: '500' } }
        },
        tooltip: {
          backgroundColor: '#090d16',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (val) => '₹' + (val / 1000).toFixed(0) + 'k'
          }
        }
      }
    }
  });
}

// Export Schedule to CSV
document.getElementById('amortExportCsvBtn').onclick = () => {
  if (activeAmortSchedule.length === 0) {
    showToast('error', 'Export Error', 'No active amortization schedule available to export.');
    return;
  }
  let csv = 'Installment,Due Date,Opening Balance,EMI,Principal,Interest,Closing Balance\n';
  activeAmortSchedule.forEach(r => {
    csv += `${r.installmentNumber},${r.paymentDate},${r.openingBalance},${r.emi},${r.principalPaid},${r.interestPaid},${r.closingBalance}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LoanWise_Amortization_Schedule.csv`;
  a.click();
  showToast('success', 'Export Completed', 'Amortization CSV downloaded to your device.');
};

// ==========================================================================
// 5. Automated Database Audit Ledger Controller
// ==========================================================================

async function loadAuditLogs() {
  const tbody = document.getElementById('auditTbody');
  try {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Synchronizing database ledger...</td></tr>`;
    const res = await apiFetch('/api/audit-logs');
    cachedAuditLogs = res.logs || [];
    filterAndRenderAuditLogs();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-rose); padding: 24px;">Failed to load audit ledger: ${err.message}</td></tr>`;
    showToast('error', 'Audit Ledger Error', err.message);
  }
}

function filterAndRenderAuditLogs() {
  const searchTerm = (document.getElementById('auditSearchInput')?.value || '').toLowerCase().trim();

  const filtered = cachedAuditLogs.filter(log => {
    const action = (log.action_type || '').toUpperCase();
    const details = (log.action_details || '').toUpperCase();

    // Chip filter
    if (activeAuditActionFilter !== 'ALL') {
      const target = activeAuditActionFilter.toUpperCase();
      const match = action.includes(target) || details.includes(target);
      if (!match) return false;
    }

    // Search filter
    if (!searchTerm) return true;
    return (
      String(log.log_id).includes(searchTerm) ||
      (log.loan_id && String(log.loan_id).includes(searchTerm)) ||
      action.toLowerCase().includes(searchTerm) ||
      details.toLowerCase().includes(searchTerm)
    );
  });

  const tbody = document.getElementById('auditTbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No ledger entries found matching active criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const action = log.action_type || 'UNKNOWN';
    let badgeClass = 'badge-slate';

    if (action.includes('PREPAYMENT')) badgeClass = 'badge-green';
    else if (action.includes('REPAYMENT') || action.includes('PAYMENT')) badgeClass = 'badge-blue';
    else if (action.includes('UPDATE') || action.includes('RATE')) badgeClass = 'badge-orange';
    else if (action.includes('DELETE') || action.includes('REMOVE')) badgeClass = 'badge-red';
    else if (action.includes('LOGIN') || action.includes('AUTH')) badgeClass = 'badge-indigo';

    const timestamp = log.action_timestamp ? new Date(log.action_timestamp).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) : '—';

    return `
      <tr>
        <td><strong style="color: var(--text-muted); font-family: var(--font-mono);">#${log.log_id}</strong></td>
        <td>${log.loan_id ? `<strong style="font-family: var(--font-mono); color: var(--accent-primary);">#${log.loan_id}</strong>` : '<span style="color: var(--text-subtle);">—</span>'}</td>
        <td><span class="badge-pill ${badgeClass}">${action}</span></td>
        <td style="color: var(--text-main); font-size: 13px;">${log.action_details || 'System event recorded.'}</td>
        <td style="color: var(--text-muted); font-size: 12px; font-family: var(--font-mono); white-space: nowrap;">${timestamp}</td>
      </tr>
    `;
  }).join('');
}

// Audit Filter Chips Binding
document.querySelectorAll('#tab-audit .filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#tab-audit .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeAuditActionFilter = chip.dataset.auditFilter || 'ALL';
    filterAndRenderAuditLogs();
  });
});

// Audit Search Input
document.getElementById('auditSearchInput')?.addEventListener('input', filterAndRenderAuditLogs);

// Refresh Audit Ledger Button
document.getElementById('refreshAuditBtn')?.addEventListener('click', () => {
  loadAuditLogs();
  showToast('info', 'Audit Ledger Refreshed', 'Fetched latest database operational events.');
});

// ==========================================================================
// Bootstrap Application
// ==========================================================================

window.onload = checkAuthSession;
