const { Schema, model } = require('mongoose');
const schema = new Schema({
  activity: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
  rollNumber: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, default: '', trim: true },
  recognition: { type: String, default: '' }
}, { timestamps: true });
schema.index({ activity: 1, rollNumber: 1 }, { unique: true });
schema.index({ rollNumber: 1 });
module.exports = model('Participant', schema);
