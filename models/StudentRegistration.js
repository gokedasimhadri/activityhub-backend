const { Schema, model } = require('mongoose');

const schema = new Schema({
  activity: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
  activityTitle: { type: String, default: '' },
  activityType: { type: String, default: '' },
  rollNumber: { type: String, required: true },
  studentName: { type: String, default: '' },
  formData: { type: Schema.Types.Mixed, default: {} },
  registeredAt: { type: Date, default: Date.now }
}, { collection: 'student_registrations' });

schema.index({ activity: 1, rollNumber: 1 }, { unique: true });
schema.index({ rollNumber: 1 });
schema.index({ registeredAt: -1 });

module.exports = model('StudentRegistration', schema);
