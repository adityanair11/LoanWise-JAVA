const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  auditId: { type: Number, unique: true, sparse: true, index: true },
  entityName: { type: String, default: 'LOAN' },
  entityId: { type: Number, default: null },
  actionName: { type: String, required: true },
  actionDetails: { type: String, default: '' },
  actionTime: { type: Date, default: Date.now, index: true }
});

AuditLogSchema.methods.toClientJSON = function() {
  return {
    log_id: this.auditId,
    loan_id: this.entityId || null,
    entity_name: this.entityName,
    action_type: this.actionName,
    action_details: this.actionDetails,
    action_timestamp: this.actionTime
  };
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
