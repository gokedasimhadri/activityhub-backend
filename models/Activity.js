const { Schema, model } = require('mongoose');
const { TYPES } = require('../config/types');
const schema = new Schema({
  type: { type: String, enum: Object.keys(TYPES), required: true },
  title: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true },
  department: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  description: { type: String, default: '' },
  details: { type: Schema.Types.Mixed, default: {} },   // type-specific fields
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft' },
  reviewNote: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
schema.index({ department: 1, academicYear: 1, type: 1 });
schema.index({ status: 1, startDate: -1 });
module.exports = model('Activity', schema);
