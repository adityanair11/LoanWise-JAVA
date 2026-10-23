const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = require('./src/db');
const { calculateEMI, generateAmortizationSchedule, generateScenarioSchedule, summarizeSchedule } = require('./src/calculator');
const { simulatePayoff, sortLoans } = require('./src/optimizer');
const { sendPrepaymentNotification } = require('./src/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'loanwise_default_secret_key';

// Unit 3: Node.js EventEmitter for domain events
class LoanWiseEventEmitter extends EventEmitter {}
const loanEvents = new LoanWiseEventEmitter();

loanEvents.on('loanUpdated', (loanId, details) => {
  console.log(`[Event:loanUpdated] Loan ${loanId} modified: ${details}`);
});

loanEvents.on('prepaymentRecorded', async (data) => {
  console.log(`[Event:prepaymentRecorded] ₹${data.amount} applied to Loan ${data.loanId}`);
  if (data.email) {
    await sendPrepaymentNotification(data.email, data.fullName, data.loanName, data.amount, data.strategy);
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Unit 3: File Uploads using Multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`)
});
const upload = multer({ storage });

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------
// Authentication Endpoints (Unit 6: Login & Register flow)
// -------------------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, monthlyIncome, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const income = parseFloat(monthlyIncome) || 0.0;

    const [result] = await pool.execute(
      'INSERT INTO user_account (full_name, email, monthly_income, password_hash) VALUES (?, ?, ?, ?)',
      [fullName.trim(), email.trim().toLowerCase(), income, hash]
    );

    const user = { userId: result.insertId, fullName: fullName.trim(), email: email.trim().toLowerCase(), monthlyIncome: income };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ message: 'User registered successfully', token, user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email address already exists' });
    }
    console.error('[Auth:Register]', err);
    res.status(500).json({ error: 'Failed to register account: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT user_id, full_name, email, monthly_income, password_hash FROM user_account WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userRow = rows[0];
    const match = await bcrypt.compare(password, userRow.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = {
      userId: userRow.user_id,
      fullName: userRow.full_name,
      email: userRow.email,
      monthlyIncome: parseFloat(userRow.monthly_income)
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });

    res.json({ message: 'Authentication successful', token, user });
  } catch (err) {
    console.error('[Auth:Login]', err);
    res.status(500).json({ error: 'Authentication failed: ' + err.message });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------
// Dashboard & Portfolio Metrics
// -------------------------------------------------------------

app.get('/api/dashboard/kpis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [loans] = await pool.execute(
      "SELECT * FROM loan WHERE user_id = ? AND loan_status = 'ACTIVE' AND outstanding_balance > 0",
      [userId]
    );

    let totalDebt = 0;
    let totalEMI = 0;

    for (const l of loans) {
      totalDebt += parseFloat(l.outstanding_balance);
      totalEMI += calculateEMI(parseFloat(l.outstanding_balance), parseFloat(l.annual_interest_rate), parseInt(l.tenure_months, 10));
    }

    const income = parseFloat(req.user.monthlyIncome) || 0;
    const dti = income > 0 ? (totalEMI / income) * 100 : (totalEMI > 0 ? 100 : 0);

    let dtiClassification = 'Healthy (< 36%)';
    if (dti > 50) dtiClassification = 'Critical Exposure (> 50%)';
    else if (dti >= 36) dtiClassification = 'Moderate Risk (36% - 50%)';

    res.json({
      totalDebt: parseFloat(totalDebt.toFixed(2)),
      activeCount: loans.length,
      monthlyCommitment: parseFloat(totalEMI.toFixed(2)),
      monthlyIncome: income,
      dti: parseFloat(dti.toFixed(1)),
      dtiClassification
    });
  } catch (err) {
    console.error('[KPIs]', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Loans Management Endpoints (CRUD)
// -------------------------------------------------------------

app.get('/api/loans', authenticateToken, async (req, res) => {
  try {
    const [loans] = await pool.execute(
      'SELECT * FROM loan WHERE user_id = ? ORDER BY loan_id ASC',
      [req.user.userId]
    );
    res.json({ loans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/loans', authenticateToken, async (req, res) => {
  try {
    const { loanName, lenderName, loanType, principalAmount, outstandingBalance, annualInterestRate, annualRateType, tenureMonths, dueDay } = req.body;

    if (!loanName || !lenderName) {
      return res.status(400).json({ error: 'Loan name and lender name are required' });
    }

    const validLoanTypes = ['HOME', 'AUTO', 'PERSONAL', 'EDUCATION', 'OTHER'];
    const sanitizedType = validLoanTypes.includes((loanType || '').toUpperCase()) ? loanType.toUpperCase() : 'OTHER';
    const sanitizedRateType = (annualRateType || '').toUpperCase() === 'FLOATING' ? 'FLOATING' : 'FIXED';

    const principal = parseFloat(principalAmount);
    const balance = parseFloat(outstandingBalance);
    const rate = parseFloat(annualInterestRate);
    const tenure = parseInt(tenureMonths, 10);
    const due = parseInt(dueDay, 10) || 5;

    if (principal <= 0 || balance < 0 || rate <= 0 || tenure <= 0) {
      return res.status(400).json({ error: 'Principal, rate, and tenure must be positive values' });
    }

    const [result] = await pool.execute(
      `INSERT INTO loan (user_id, loan_name, lender_name, loan_type, principal_amount, outstanding_balance, annual_interest_rate, annual_rate_type, annual_rate_start_date, tenure_months, start_date, due_day, loan_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, CURDATE(), ?, ?)`,
      [req.user.userId, loanName.trim(), lenderName.trim(), sanitizedType, principal, balance, rate, sanitizedRateType, tenure, due, balance <= 0 ? 'CLOSED' : 'ACTIVE']
    );

    res.status(201).json({ message: 'Loan created successfully', loanId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/loans/:id', authenticateToken, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { loanName, lenderName, outstandingBalance, annualInterestRate, annualRateType, tenureMonths } = req.body;

    const [current] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
    if (current.length === 0) return res.status(404).json({ error: 'Loan not found' });

    const balance = parseFloat(outstandingBalance);
    const rate = parseFloat(annualInterestRate);
    const tenure = parseInt(tenureMonths, 10);
    const sanitizedRateType = (annualRateType || '').toUpperCase() === 'FLOATING' ? 'FLOATING' : 'FIXED';
    const status = balance <= 0 ? 'CLOSED' : 'ACTIVE';

    await pool.execute(
      `UPDATE loan SET loan_name = ?, lender_name = ?, outstanding_balance = ?, annual_interest_rate = ?, annual_rate_type = ?, tenure_months = ?, loan_status = ? WHERE loan_id = ?`,
      [loanName.trim(), lenderName.trim(), balance, rate, sanitizedRateType, tenure, status, loanId]
    );

    loanEvents.emit('loanUpdated', loanId, `Updated balance: ₹${balance}, rate: ${rate}%`);
    res.json({ message: 'Loan updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/loans/:id', authenticateToken, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);
    const [result] = await pool.execute('DELETE FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Loan not found' });
    res.json({ message: 'Loan deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Prepayments
// -------------------------------------------------------------

app.post('/api/prepayments', authenticateToken, async (req, res) => {
  try {
    const { loanId, amount, strategy = 'AVALANCHE', notes = 'Prepayment' } = req.body;
    const payAmount = parseFloat(amount);

    const [loanRows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
    if (loanRows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    const loan = loanRows[0];
    if (payAmount <= 0) return res.status(400).json({ error: 'Prepayment amount must be strictly positive' });
    if (payAmount > parseFloat(loan.outstanding_balance)) {
      return res.status(400).json({ error: `Prepayment (₹${payAmount}) cannot exceed outstanding balance (₹${loan.outstanding_balance})` });
    }

    const [insertResult] = await pool.execute(
      'INSERT INTO prepayment (loan_id, prepayment_date, amount, strategy, notes) VALUES (?, CURDATE(), ?, ?, ?)',
      [loanId, payAmount, strategy, notes]
    );

    // MySQL triggers automatically adjust loan balance and log to audit_log
    const newBal = Math.max(0, parseFloat(loan.outstanding_balance) - payAmount);
    await pool.execute('UPDATE loan SET outstanding_balance = ? WHERE loan_id = ?', [newBal, loanId]);

    loanEvents.emit('prepaymentRecorded', {
      loanId,
      amount: payAmount,
      strategy,
      email: req.user.email,
      fullName: req.user.fullName,
      loanName: loan.loan_name
    });

    res.status(201).json({ message: 'Prepayment recorded successfully', prepaymentId: insertResult.insertId, newBalance: newBal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Amortization & Scenario Simulation
// -------------------------------------------------------------

app.get('/api/amortization/:loanId', authenticateToken, async (req, res) => {
  try {
    const loanId = parseInt(req.params.loanId, 10);
    const [rows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    const loan = rows[0];
    const principal = parseFloat(loan.outstanding_balance) > 0 ? parseFloat(loan.outstanding_balance) : parseFloat(loan.principal_amount);
    const rate = parseFloat(loan.annual_interest_rate);
    const tenure = parseInt(loan.tenure_months, 10);

    const schedule = generateAmortizationSchedule(principal, rate, tenure, loan.start_date || new Date());
    const summary = summarizeSchedule(schedule);

    res.json({ loan, schedule, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/amortization/scenario', authenticateToken, async (req, res) => {
  try {
    const { loanId, extraPrepayment = 0, revisedRate, effectiveMonth = 1 } = req.body;
    const [rows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    const loan = rows[0];
    const principal = parseFloat(loan.outstanding_balance) > 0 ? parseFloat(loan.outstanding_balance) : parseFloat(loan.principal_amount);
    const initialRate = parseFloat(loan.annual_interest_rate);
    const targetRate = revisedRate ? parseFloat(revisedRate) : initialRate;
    const tenure = parseInt(loan.tenure_months, 10);

    const baselineSchedule = generateAmortizationSchedule(principal, initialRate, tenure, loan.start_date);
    const scenarioSchedule = generateScenarioSchedule(principal, initialRate, targetRate, parseInt(effectiveMonth, 10), parseFloat(extraPrepayment), tenure, loan.start_date);

    const baselineSummary = summarizeSchedule(baselineSchedule);
    const scenarioSummary = summarizeSchedule(scenarioSchedule);

    res.json({
      loan,
      baselineSummary,
      scenarioSummary,
      schedule: scenarioSchedule,
      monthsSaved: Math.max(0, baselineSummary.totalMonths - scenarioSummary.totalMonths),
      interestSaved: parseFloat((baselineSummary.totalInterest - scenarioSummary.totalInterest).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Payoff Acceleration Optimizer (Avalanche vs Snowball)
// -------------------------------------------------------------

app.post('/api/optimizer/simulate', authenticateToken, async (req, res) => {
  try {
    const { strategy = 'AVALANCHE', extraBudget = 5000 } = req.body;
    const [loans] = await pool.execute(
      "SELECT * FROM loan WHERE user_id = ? AND loan_status = 'ACTIVE' AND outstanding_balance > 0",
      [req.user.userId]
    );

    const result = simulatePayoff(loans, strategy, parseFloat(extraBudget) || 0);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Audit Log Feed
// -------------------------------------------------------------

app.get('/api/audit-logs', authenticateToken, async (req, res) => {
  try {
    let logs = [];
    try {
      // Primary live schema: audit_id, entity_name, entity_id, action_name, action_details, action_time
      const [rows] = await pool.execute(
        'SELECT audit_id, entity_id, entity_name, action_name, action_details, action_time FROM audit_log ORDER BY audit_id DESC LIMIT 100'
      );
      logs = rows.map(r => ({
        log_id: r.audit_id,
        loan_id: r.entity_id || null,
        entity_name: r.entity_name || 'LOAN',
        action_type: r.action_name,
        action_details: r.action_details || '',
        action_timestamp: r.action_time
      }));
    } catch (e1) {
      // Fallback schema: log_id, loan_id, action_type, action_details, action_timestamp
      const [rows] = await pool.execute(
        'SELECT log_id, loan_id, action_type, action_details, action_timestamp FROM audit_log ORDER BY log_id DESC LIMIT 100'
      );
      logs = rows;
    }
    res.json({ logs });
  } catch (err) {
    console.error('[Audit Logs Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Unit 3: File Upload Endpoint
// -------------------------------------------------------------

app.post('/api/files/upload', authenticateToken, upload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[LoanWise Web Server] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
