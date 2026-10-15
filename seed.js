require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Activity = require('./models/Activity');
const Participant = require('./models/Participant');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User.deleteMany({}), Activity.deleteMany({}), Participant.deleteMany({})]);
  const pw = await bcrypt.hash('password123', 10);
  const [admin, hod, fac] = await User.insertMany([
    { name: 'Dean Admin', email: 'admin@aditya.edu', password: pw, role: 'admin', department: 'CSE' },
    { name: 'Dr. Lakshmi (HOD)', email: 'hod@aditya.edu', password: pw, role: 'hod', department: 'CSE' },
    { name: 'Ravi Kumar', email: 'faculty@aditya.edu', password: pw, role: 'faculty', department: 'CSE' }
  ]);
  const seeds = [
    ['workshop', 'Full Stack Development with MERN', '2025-26', '2025-08-12', { contactHours: 16, resourcePerson: 'Mr. Anil, TCS' }, 'approved'],
    ['guest_lecture', 'Careers in Cloud Computing', '2025-26', '2025-09-05', { resourcePerson: 'Ms. Priya, AWS' }, 'approved'],
    ['industrial_visit', 'Visit to Tech Mahindra Campus', '2025-26', '2025-11-20', { industry: 'Tech Mahindra', place: 'Hyderabad', semester: 'V', classSection: 'CSE-A' }, 'approved'],
    ['capacity_development', 'Communication Skills Bootcamp', '2025-26', '2026-01-18', { category: 'Soft Skills', resourcePerson: 'Mr. Rao' }, 'approved'],
    ['outreach', 'Swachh Campus Drive', '2026-27', '2026-08-02', { unit: 'NSS', venue: 'Peddapuram' }, 'approved'],
    ['workshop', 'Introduction to Generative AI', '2026-27', '2026-09-14', { contactHours: 8, resourcePerson: 'Dr. Sen, IIT' }, 'submitted'],
    ['club_activity', 'Hackathon Night', '2026-27', '2026-10-03', { club: 'Coding Club' }, 'submitted'],
    ['entrepreneurship', 'Startup Pitch Day', '2026-27', '2026-10-25', { eventType: 'Competition', organizedBy: 'IIC', outcome: '5 teams shortlisted' }, 'draft']
  ];
  for (const [type, title, academicYear, date, details, status] of seeds) {
    const a = await Activity.create({ type, title, academicYear, department: 'CSE', startDate: date, details, status, createdBy: fac._id });
    const n = 20 + Math.floor(Math.random() * 40);
    await Participant.insertMany(Array.from({ length: n }, (_, i) => ({ activity: a._id, rollNumber: `22A91A05${String(i + 1).padStart(2, '0')}`, name: `Student ${i + 1}` })));
  }
  console.log('Seeded. Logins (password: password123): admin@aditya.edu, hod@aditya.edu, faculty@aditya.edu');
  process.exit(0);
})();
