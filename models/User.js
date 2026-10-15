const { Schema, model } = require('mongoose');
module.exports = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['faculty', 'hod', 'admin'], default: 'faculty' },
  department: { type: String, default: 'CSE' }
}, { timestamps: true }));
