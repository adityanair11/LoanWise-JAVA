const mongoose = require('mongoose');

const PrepaymentSchema = new mongoose.Schema({
  prepaymentId: { type: Number, unique: true, sparse: true, index: true },
  loanId: { type: Number, required: true, index: true },
  userId: { type: Number, required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  strategy: { 
    type: String, 
    enum: ['AVALANCHE', 'SNOWBALL', 'MANUAL'], 
    default: 'MANUAL' 
  },
  prepaymentDate: { type: Date, default: Date.now },
  notes: { type: String, default: '' }
});

module.exports = mongoose.model('Prepayment', PrepaymentSchema);
