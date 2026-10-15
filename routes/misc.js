const router = require('express').Router();
const ExcelJS = require('exceljs');
const Activity = require('../models/Activity');
const Participant = require('../models/Participant');
const { auth } = require('../middleware/auth');
const { TYPES, DEPARTMENTS } = require('../config/types');

router.get('/meta', async (req, res) => {
  const years = await Activity.distinct('academicYear');
  res.json({ types: TYPES, departments: DEPARTMENTS, academicYears: [...new Set([...years, '2025-26', '2026-27'])].sort().reverse() });
});

router.use(auth);

const scope = (u, ay) => ({ ...(u.role === 'admin' ? {} : { department: u.department }), ...(ay ? { academicYear: ay } : {}) });

router.get('/stats', async (req, res) => {
  const match = scope(req.user, req.query.academicYear);
  const [byType, byStatus, byMonth, ids] = await Promise.all([
    Activity.aggregate([{ $match: match }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Activity.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Activity.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$startDate' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Activity.find(match).distinct('_id')
  ]);
  const participants = await Participant.countDocuments({ activity: { $in: ids } });
  res.json({ total: ids.length, participants, byType, byStatus, byMonth });
});

// Excel export laid out like the university data collection forms (approved activities only)
router.get('/export/:type', async (req, res) => {
  const t = TYPES[req.params.type];
  if (!t) return res.status(404).json({ message: 'Unknown activity type' });
  const match = { ...scope(req.user, req.query.academicYear), type: req.params.type, status: 'approved' };
  const items = await Activity.find(match).sort({ startDate: 1 }).lean();
  const counts = await Participant.aggregate([{ $match: { activity: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$activity', n: { $sum: 1 } } }]);
  const cm = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.label.slice(0, 30));
  const cols = ['S.No', 'Academic Year', `Name of the ${t.label}`, 'Date(s)', ...t.fields.map((f) => f.label), 'No. of Students Participated'];
  const dept = req.user.role === 'admin' ? 'All Departments' : req.user.department;
  ws.addRow(['ADITYA UNIVERSITY']); ws.addRow([`Department of ${dept}`]); ws.addRow([`${t.label} organized`]); ws.addRow([t.form]);
  [1, 2, 3, 4].forEach((r) => { ws.mergeCells(r, 1, r, cols.length); ws.getRow(r).alignment = { horizontal: 'center' }; ws.getRow(r).font = { bold: true, size: r === 1 ? 14 : 11 }; });
  const head = ws.addRow(cols);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF11243A' } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; });
  const d = (x) => (x ? new Date(x).toLocaleDateString('en-GB') : '');
  items.forEach((a, i) => ws.addRow([i + 1, a.academicYear, a.title, a.endDate ? `${d(a.startDate)} to ${d(a.endDate)}` : d(a.startDate), ...t.fields.map((f) => (a.details || {})[f.key] ?? ''), cm[String(a._id)] || 0]));
  ws.columns.forEach((c, i) => { c.width = i === 2 ? 40 : 20; });
  ws.eachRow((row, n) => { if (n >= 5) row.eachCell((c) => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }); });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}_${req.query.academicYear || 'all'}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});
module.exports = router;
