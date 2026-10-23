/**
 * Seed script to populate MongoDB Atlas with initial LoanWise demo data
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Loan = require('../src/models/Loan');
const AuditLog = require('../src/models/AuditLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adityanair0911_db_user:lKVaMKtigOHyuQ5M@adityacluster1.f8sgc32.mongodb.net/loanwise?retryWrites=true&w=majority';

async function seed() {
  console.log('[Seed] Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);
  console.log('[Seed] Connected.');

  // 1. Seed Demo User: Aarav Sharma
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password@123', salt);

  let user = await User.findOne({ email: 'aarav@example.com' });
  if (!user) {
    user = await User.create({
      userId: 1,
      fullName: 'Aarav Sharma',
      email: 'aarav@example.com',
      passwordHash,
      monthlyIncome: 85000,
      role: 'USER'
    });
    console.log('[Seed] Created default user Aarav Sharma (ID: 1)');
  } else {
    console.log('[Seed] User Aarav Sharma already exists (ID: 1)');
  }

  // 2. Seed Default Loans
  const demoLoans = [
    {
      loanId: 1,
      userId: 1,
      loanName: 'Home Loan',
      lenderName: 'HDFC Bank',
      loanType: 'HOME',
      principalAmount: 3500000,
      outstandingBalance: 3200000,
      annualInterestRate: 8.50,
      annualRateType: 'FLOATING',
      tenureMonths: 240,
      loanStatus: 'ACTIVE'
    },
    {
      loanId: 2,
      userId: 1,
      loanName: 'Car Loan',
      lenderName: 'ICICI Bank',
      loanType: 'AUTO',
      principalAmount: 850000,
      outstandingBalance: 396811,
      annualInterestRate: 9.25,
      annualRateType: 'FIXED',
      tenureMonths: 48,
      loanStatus: 'ACTIVE'
    },
    {
      loanId: 3,
      userId: 1,
      loanName: 'Personal Loan',
      lenderName: 'Axis Bank',
      loanType: 'PERSONAL',
      principalAmount: 500000,
      outstandingBalance: 307400,
      annualInterestRate: 13.50,
      annualRateType: 'FIXED',
      tenureMonths: 36,
      loanStatus: 'ACTIVE'
    }
  ];

  for (const dl of demoLoans) {
    const existing = await Loan.findOne({ loanId: dl.loanId });
    if (!existing) {
      await Loan.create(dl);
      console.log(`[Seed] Created loan: ${dl.loanName}`);
    }
  }

  // 3. Seed Initial Audit Logs
  const existingLogs = await AuditLog.countDocuments();
  if (existingLogs === 0) {
    await AuditLog.create([
      {
        auditId: 1,
        entityName: 'LOAN',
        entityId: 1,
        actionName: 'INSERT',
        actionDetails: 'Loan facility sanctioned: Home Loan for INR 3,500,000'
      },
      {
        auditId: 2,
        entityName: 'LOAN',
        entityId: 2,
        actionName: 'INSERT',
        actionDetails: 'Loan facility sanctioned: Car Loan for INR 850,000'
      },
      {
        auditId: 3,
        entityName: 'LOAN',
        entityId: 3,
        actionName: 'INSERT',
        actionDetails: 'Loan facility sanctioned: Personal Loan for INR 500,000'
      },
      {
        auditId: 4,
        entityName: 'USER',
        entityId: 1,
        actionName: 'USER_LOGIN',
        actionDetails: 'User authenticated: Aarav Sharma (aarav@example.com)'
      }
    ]);
    console.log('[Seed] Populated initial audit log ledger.');
  }

  console.log('[Seed] Database initialization complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
