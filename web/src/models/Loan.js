const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
  loanId: { type: Number, unique: true, sparse: true, index: true },
  userId: { type: Number, required: true, index: true },
  loanName: { type: String, required: true, trim: true },
  lenderName: { type: String, required: true, trim: true },
  loanType: { 
    type: String, 
    required: true, 
    enum: ['HOME', 'AUTO', 'PERSONAL', 'EDUCATION', 'OTHER'],
    default: 'OTHER'
  },
  principalAmount: { type: Number, required: true, min: 0 },
  outstandingBalance: { type: Number, required: true, min: 0 },
  annualInterestRate: { type: Number, required: true, min: 0 },
  annualRateType: { type: String, enum: ['FIXED', 'FLOATING'], default: 'FIXED' },
  tenureMonths: { type: Number, required: true, min: 1 },
  loanStatus: { type: String, enum: ['ACTIVE', 'CLOSED', 'DEFAULTED'], default: 'ACTIVE' },
  createdAt: { type: Date, default: Date.now }
});

// Helper to format loan document to the format expected by the frontend
LoanSchema.methods.toClientJSON = function() {
  return {
    loan_id: this.loanId,
    user_id: this.userId,
    loan_name: this.loanName,
    lender_name: this.lenderName,
    loan_type: this.loanType,
    principal_amount: this.principalAmount,
    outstanding_balance: this.outstandingBalance,
    annual_interest_rate: this.annualInterestRate,
    annual_rate_type: this.annualRateType,
    tenure_months: this.tenureMonths,
    loan_status: this.loanStatus,
    created_at: this.createdAt
  };
};

module.exports = mongoose.model('Loan', LoanSchema);
