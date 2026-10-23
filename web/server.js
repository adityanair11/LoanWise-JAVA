const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { pool, connectMongo } = require('./src/db');
const User = require('./src/models/User');
const Loan = require('./src/models/Loan');
const Prepayment = require('./src/models/Prepayment');
const AuditLog = require('./src/models/AuditLog');

const { calculateEMI, generateAmortizationSchedule, generateScenarioSchedule, summarizeSchedule } = require('./src/calculator');
const { simulatePayoff, sortLoans } = require('./src/optimizer');
const { sendPrepaymentNotification } = require('./src/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'loanwise_default_secret_key';
const isMongo = !!process.env.MONGODB_URI;

// Initialize Database Connection
if (isMongo) {
  connectMongo(process.env.MONGODB_URI)
    .then(() => console.log('[LoanWise Database] Connected to MongoDB Atlas successfully.'))
    .catch(err => console.error('[LoanWise Database] MongoDB connection error:', err.message));
} else {
  console.log('[LoanWise Database] Running in MySQL relational mode.');
}

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

// File Uploads using Multer
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

// Helper to log audit events
async function recordAudit(entityName, entityId, actionName, actionDetails) {
  try {
    if (isMongo) {
      const last = await AuditLog.findOne().sort({ auditId: -1 });
      const auditId = (last && last.auditId) ? last.auditId + 1 : Date.now();
      await AuditLog.create({
        auditId,
        entityName,
        entityId: entityId || null,
        actionName,
        actionDetails,
        actionTime: new Date()
      });
    } else {
      await pool.execute(
        'INSERT INTO audit_log (entity_name, entity_id, action_name, action_details, action_time) VALUES (?, ?, ?, ?, NOW())',
        [entityName, entityId || null, actionName, actionDetails]
      );
    }
  } catch (e) {
    console.error('[Audit Logging Error]', e.message);
  }
}

// -------------------------------------------------------------
// Authentication Endpoints
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
    const cleanEmail = email.trim().toLowerCase();

    if (isMongo) {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(409).json({ error: 'An account with this email address already exists' });
      }

      const lastUser = await User.findOne().sort({ userId: -1 });
      const nextUserId = (lastUser && lastUser.userId) ? lastUser.userId + 1 : 1;

      const userDoc = await User.create({
        userId: nextUserId,
        fullName: fullName.trim(),
        email: cleanEmail,
        passwordHash: hash,
        monthlyIncome: income,
        role: 'USER'
      });

      await recordAudit('USER', nextUserId, 'REGISTER', `User registered: ${userDoc.fullName} (${cleanEmail})`);

      const user = { userId: userDoc.userId, fullName: userDoc.fullName, email: userDoc.email, monthlyIncome: userDoc.monthlyIncome };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      return res.status(201).json({ message: 'User registered successfully', token, user });
    } else {
      const [result] = await pool.execute(
        'INSERT INTO user_account (full_name, email, monthly_income, password_hash) VALUES (?, ?, ?, ?)',
        [fullName.trim(), cleanEmail, income, hash]
      );

      const user = { userId: result.insertId, fullName: fullName.trim(), email: cleanEmail, monthlyIncome: income };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      return res.status(201).json({ message: 'User registered successfully', token, user });
    }
  } catch (err) {
    if (err.code === 11000 || err.code === 'ER_DUP_ENTRY') {
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

    const cleanEmail = email.trim().toLowerCase();

    if (isMongo) {
      const userDoc = await User.findOne({ email: cleanEmail });
      if (!userDoc) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const match = await bcrypt.compare(password, userDoc.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      await recordAudit('USER', userDoc.userId, 'USER_LOGIN', `User authenticated: ${userDoc.fullName} (${cleanEmail})`);

      const user = {
        userId: userDoc.userId,
        fullName: userDoc.fullName,
        email: userDoc.email,
        monthlyIncome: parseFloat(userDoc.monthlyIncome)
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: 'Authentication successful', token, user });
    } else {
      const [rows] = await pool.execute(
        'SELECT user_id, full_name, email, monthly_income, password_hash FROM user_account WHERE email = ?',
        [cleanEmail]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const userRow = rows[0];
      const match = await bcrypt.compare(password, userRow.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      await recordAudit('USER', userRow.user_id, 'USER_LOGIN', `User authenticated: ${userRow.full_name} (${cleanEmail})`);

      const user = {
        userId: userRow.user_id,
        fullName: userRow.full_name,
        email: userRow.email,
        monthlyIncome: parseFloat(userRow.monthly_income)
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: 'Authentication successful', token, user });
    }
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
    let loans = [];

    if (isMongo) {
      const docs = await Loan.find({ userId, loanStatus: 'ACTIVE', outstandingBalance: { $gt: 0 } });
      loans = docs.map(d => d.toClientJSON());
    } else {
      const [rows] = await pool.execute(
        "SELECT * FROM loan WHERE user_id = ? AND loan_status = 'ACTIVE' AND outstanding_balance > 0",
        [userId]
      );
      loans = rows;
    }

    let totalDebt = 0;
    let totalEMI = 0;

    for (const l of loans) {
      const bal = parseFloat(l.outstanding_balance);
      const rate = parseFloat(l.annual_interest_rate);
      const tenure = parseInt(l.tenure_months, 10);
      totalDebt += bal;
      totalEMI += calculateEMI(bal, rate, tenure);
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
    if (isMongo) {
      const docs = await Loan.find({ userId: req.user.userId }).sort({ loanId: 1 });
      const loans = docs.map(d => d.toClientJSON());
      return res.json({ loans });
    } else {
      const [loans] = await pool.execute(
        'SELECT * FROM loan WHERE user_id = ? ORDER BY loan_id ASC',
        [req.user.userId]
      );
      return res.json({ loans });
    }
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

    if (isMongo) {
      const lastLoan = await Loan.findOne().sort({ loanId: -1 });
      const nextLoanId = (lastLoan && lastLoan.loanId) ? lastLoan.loanId + 1 : 1;

      await Loan.create({
        loanId: nextLoanId,
        userId: req.user.userId,
        loanName: loanName.trim(),
        lenderName: lenderName.trim(),
        loanType: sanitizedType,
        principalAmount: principal,
        outstandingBalance: balance,
        annualInterestRate: rate,
        annualRateType: sanitizedRateType,
        tenureMonths: tenure,
        loanStatus: balance <= 0 ? 'CLOSED' : 'ACTIVE'
      });

      await recordAudit('LOAN', nextLoanId, 'INSERT', `Loan facility created: ${loanName} for INR ${principal.toLocaleString('en-IN')}`);
      return res.status(201).json({ message: 'Loan created successfully', loanId: nextLoanId });
    } else {
      const [result] = await pool.execute(
        `INSERT INTO loan (user_id, loan_name, lender_name, loan_type, principal_amount, outstanding_balance, annual_interest_rate, annual_rate_type, annual_rate_start_date, tenure_months, start_date, due_day, loan_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, CURDATE(), ?, ?)`,
        [req.user.userId, loanName.trim(), lenderName.trim(), sanitizedType, principal, balance, rate, sanitizedRateType, tenure, due, balance <= 0 ? 'CLOSED' : 'ACTIVE']
      );

      await recordAudit('LOAN', result.insertId, 'INSERT', `Loan facility created: ${loanName} for INR ${principal.toLocaleString('en-IN')}`);
      return res.status(201).json({ message: 'Loan created successfully', loanId: result.insertId });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/loans/:id', authenticateToken, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);
    const { loanName, lenderName, outstandingBalance, annualInterestRate, annualRateType, tenureMonths } = req.body;

    const balance = parseFloat(outstandingBalance);
    const rate = parseFloat(annualInterestRate);
    const tenure = parseInt(tenureMonths, 10);
    const sanitizedRateType = (annualRateType || '').toUpperCase() === 'FLOATING' ? 'FLOATING' : 'FIXED';
    const status = balance <= 0 ? 'CLOSED' : 'ACTIVE';

    if (isMongo) {
      const doc = await Loan.findOne({ loanId, userId: req.user.userId });
      if (!doc) return res.status(404).json({ error: 'Loan not found' });

      doc.loanName = loanName.trim();
      doc.lenderName = lenderName.trim();
      doc.outstandingBalance = balance;
      doc.annualInterestRate = rate;
      doc.annualRateType = sanitizedRateType;
      doc.tenureMonths = tenure;
      doc.loanStatus = status;
      await doc.save();

      await recordAudit('LOAN', loanId, 'UPDATE', `Loan updated: ${doc.loanName}, Balance: INR ${balance}, Rate: ${rate}%`);
      loanEvents.emit('loanUpdated', loanId, `Updated balance: ₹${balance}, rate: ${rate}%`);
      return res.json({ message: 'Loan updated successfully' });
    } else {
      const [current] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      if (current.length === 0) return res.status(404).json({ error: 'Loan not found' });

      await pool.execute(
        `UPDATE loan SET loan_name = ?, lender_name = ?, outstanding_balance = ?, annual_interest_rate = ?, annual_rate_type = ?, tenure_months = ?, loan_status = ? WHERE loan_id = ?`,
        [loanName.trim(), lenderName.trim(), balance, rate, sanitizedRateType, tenure, status, loanId]
      );

      await recordAudit('LOAN', loanId, 'UPDATE', `Loan updated: ${loanName}, Balance: INR ${balance}, Rate: ${rate}%`);
      loanEvents.emit('loanUpdated', loanId, `Updated balance: ₹${balance}, rate: ${rate}%`);
      return res.json({ message: 'Loan updated successfully' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/loans/:id', authenticateToken, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id, 10);

    if (isMongo) {
      const doc = await Loan.findOneAndDelete({ loanId, userId: req.user.userId });
      if (!doc) return res.status(404).json({ error: 'Loan not found' });

      await recordAudit('LOAN', loanId, 'DELETE', `Loan deleted: ${doc.loanName}`);
      return res.json({ message: 'Loan deleted successfully' });
    } else {
      const [current] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      if (current.length === 0) return res.status(404).json({ error: 'Loan not found' });

      await pool.execute('DELETE FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      await recordAudit('LOAN', loanId, 'DELETE', `Loan deleted: ${current[0].loan_name}`);
      return res.json({ message: 'Loan deleted successfully' });
    }
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

    if (payAmount <= 0) return res.status(400).json({ error: 'Prepayment amount must be strictly positive' });

    if (isMongo) {
      const loan = await Loan.findOne({ loanId, userId: req.user.userId });
      if (!loan) return res.status(404).json({ error: 'Loan not found' });

      if (payAmount > loan.outstandingBalance) {
        return res.status(400).json({ error: `Prepayment (₹${payAmount}) cannot exceed outstanding balance (₹${loan.outstandingBalance})` });
      }

      const lastPrepay = await Prepayment.findOne().sort({ prepaymentId: -1 });
      const prepayId = (lastPrepay && lastPrepay.prepaymentId) ? lastPrepay.prepaymentId + 1 : 1;

      await Prepayment.create({
        prepaymentId: prepayId,
        loanId,
        userId: req.user.userId,
        amount: payAmount,
        strategy,
        notes
      });

      const newBal = Math.max(0, loan.outstandingBalance - payAmount);
      loan.outstandingBalance = newBal;
      if (newBal === 0) loan.loanStatus = 'CLOSED';
      await loan.save();

      await recordAudit('PREPAYMENT', loanId, 'PREPAYMENT', `Prepayment amount=₹${payAmount.toFixed(2)}, new balance=₹${newBal.toFixed(2)} [${strategy}]`);

      loanEvents.emit('prepaymentRecorded', {
        loanId,
        amount: payAmount,
        strategy,
        email: req.user.email,
        fullName: req.user.fullName,
        loanName: loan.loanName
      });

      return res.status(201).json({ message: 'Prepayment recorded successfully', prepaymentId: prepayId, newBalance: newBal });
    } else {
      const [loanRows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      if (loanRows.length === 0) return res.status(404).json({ error: 'Loan not found' });

      const loan = loanRows[0];
      if (payAmount > parseFloat(loan.outstanding_balance)) {
        return res.status(400).json({ error: `Prepayment (₹${payAmount}) cannot exceed outstanding balance (₹${loan.outstanding_balance})` });
      }

      const [insertResult] = await pool.execute(
        'INSERT INTO prepayment (loan_id, prepayment_date, amount, strategy, notes) VALUES (?, CURDATE(), ?, ?, ?)',
        [loanId, payAmount, strategy, notes]
      );

      const newBal = Math.max(0, parseFloat(loan.outstanding_balance) - payAmount);
      await pool.execute('UPDATE loan SET outstanding_balance = ? WHERE loan_id = ?', [newBal, loanId]);

      await recordAudit('PREPAYMENT', loanId, 'PREPAYMENT', `Prepayment amount=₹${payAmount.toFixed(2)}, new balance=₹${newBal.toFixed(2)} [${strategy}]`);

      loanEvents.emit('prepaymentRecorded', {
        loanId,
        amount: payAmount,
        strategy,
        email: req.user.email,
        fullName: req.user.fullName,
        loanName: loan.loan_name
      });

      return res.status(201).json({ message: 'Prepayment recorded successfully', prepaymentId: insertResult.insertId, newBalance: newBal });
    }
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
    let loan = null;

    if (isMongo) {
      const doc = await Loan.findOne({ loanId, userId: req.user.userId });
      if (!doc) return res.status(404).json({ error: 'Loan not found' });
      loan = doc.toClientJSON();
    } else {
      const [rows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
      loan = rows[0];
    }

    const principal = parseFloat(loan.outstanding_balance) > 0 ? parseFloat(loan.outstanding_balance) : parseFloat(loan.principal_amount);
    const rate = parseFloat(loan.annual_interest_rate);
    const tenure = parseInt(loan.tenure_months, 10);

    const schedule = generateAmortizationSchedule(principal, rate, tenure, loan.created_at || new Date());
    const summary = summarizeSchedule(schedule);

    res.json({ loan, schedule, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/amortization/scenario', authenticateToken, async (req, res) => {
  try {
    const { loanId, extraPrepayment = 0, revisedRate, effectiveMonth = 1 } = req.body;
    let loan = null;

    if (isMongo) {
      const doc = await Loan.findOne({ loanId, userId: req.user.userId });
      if (!doc) return res.status(404).json({ error: 'Loan not found' });
      loan = doc.toClientJSON();
    } else {
      const [rows] = await pool.execute('SELECT * FROM loan WHERE loan_id = ? AND user_id = ?', [loanId, req.user.userId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
      loan = rows[0];
    }

    const principal = parseFloat(loan.outstanding_balance) > 0 ? parseFloat(loan.outstanding_balance) : parseFloat(loan.principal_amount);
    const initialRate = parseFloat(loan.annual_interest_rate);
    const targetRate = revisedRate ? parseFloat(revisedRate) : initialRate;
    const tenure = parseInt(loan.tenure_months, 10);

    const baselineSchedule = generateAmortizationSchedule(principal, initialRate, tenure, loan.created_at);
    const scenarioSchedule = generateScenarioSchedule(principal, initialRate, targetRate, parseInt(effectiveMonth, 10), parseFloat(extraPrepayment), tenure, loan.created_at);

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
    let loans = [];

    if (isMongo) {
      const docs = await Loan.find({ userId: req.user.userId, loanStatus: 'ACTIVE', outstandingBalance: { $gt: 0 } });
      loans = docs.map(d => d.toClientJSON());
    } else {
      const [rows] = await pool.execute(
        "SELECT * FROM loan WHERE user_id = ? AND loan_status = 'ACTIVE' AND outstanding_balance > 0",
        [req.user.userId]
      );
      loans = rows;
    }

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
    if (isMongo) {
      const docs = await AuditLog.find().sort({ actionTime: -1, auditId: -1 }).limit(100);
      logs = docs.map(d => d.toClientJSON());
    } else {
      try {
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
        const [rows] = await pool.execute(
          'SELECT log_id, loan_id, action_type, action_details, action_timestamp FROM audit_log ORDER BY log_id DESC LIMIT 100'
        );
        logs = rows;
      }
    }
    res.json({ logs });
  } catch (err) {
    console.error('[Audit Logs Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// File Upload Endpoint
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
