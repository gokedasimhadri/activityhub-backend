const router = require('express').Router();
const Activity = require('../models/Activity');
const Participant = require('../models/Participant');
const StudentRegistration = require('../models/StudentRegistration');
const { auth, role } = require('../middleware/auth');
const { TYPES } = require('../config/types');
router.use(auth);

const isAdmin = (u) => u.role === 'admin';
const isHodOrAdmin = (u) => ['hod', 'admin'].includes(u.role);
const canSee = (u, a) => isAdmin(u) || a.department === u.department;
const canEdit = (u, a) => isAdmin(u) || (String(a.createdBy._id || a.createdBy) === String(u._id) && ['draft', 'rejected'].includes(a.status));

async function load(req, res) {
  const a = await Activity.findById(req.params.id).populate('createdBy', 'name email');
  if (!a || !canSee(req.user, a)) { res.status(404).json({ message: 'Activity not found' }); return null; }
  return a;
}

// GET /api/activities/student-registrations — all student registrations across activities (MUST be before /:id)
router.get('/student-registrations', async (req, res) => {
  try {
    const regs = await StudentRegistration.find()
      .populate('activity', 'title type department startDate endDate')
      .sort({ registeredAt: -1 })
      .lean();

    const formatted = regs.map((r) => ({
      _id: r._id,
      activityId: r.activity?._id || r.activity,
      activityTitle: r.activity?.title || r.activityTitle || 'Activity Hub Activity',
      activityType: r.activity?.type || r.activityType || 'Workshop',
      department: r.activity?.department || '—',
      rollNumber: r.rollNumber,
      studentName: r.studentName,
      formData: r.formData || {},
      registeredAt: r.registeredAt
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching student registrations:', err);
    res.status(500).json({ message: 'Failed to retrieve registrations' });
  }
});

router.get('/', async (req, res) => {
  const { type, status, academicYear, q, department } = req.query;
  const f = {};
  if (type) f.type = type;
  if (status) f.status = status;
  if (academicYear) f.academicYear = academicYear;
  if (q) f.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (isAdmin(req.user)) { if (department) f.department = department; } else f.department = req.user.department;
  const items = await Activity.find(f).sort({ startDate: -1 }).limit(300).populate('createdBy', 'name').lean();
  const counts = await Participant.aggregate([{ $match: { activity: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$activity', n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));

  // Also include student registration counts
  const regCounts = await StudentRegistration.aggregate([
    { $match: { activity: { $in: items.map((i) => i._id) } } },
    { $group: { _id: '$activity', n: { $sum: 1 } } }
  ]);
  const regMap = Object.fromEntries(regCounts.map((c) => [String(c._id), c.n]));

  res.json(items.map((i) => ({
    ...i,
    participantCount: map[String(i._id)] || 0,
    studentRegistrationCount: regMap[String(i._id)] || 0
  })));
});

router.post('/', async (req, res) => {
  const b = req.body;
  if (!TYPES[b.type]) return res.status(400).json({ message: 'Choose a valid activity type' });
  if (!b.title || !b.startDate || !b.academicYear) return res.status(400).json({ message: 'Title, academic year and start date are required' });
  const a = await Activity.create({
    type: b.type, title: b.title, academicYear: b.academicYear, startDate: b.startDate, endDate: b.endDate || undefined,
    description: b.description, details: b.details || {},
    department: isAdmin(req.user) && b.department ? b.department : req.user.department, createdBy: req.user._id,
    isEnabled: b.isEnabled || false,
    targetAudience: b.targetAudience || 'Both'
  });
  res.status(201).json(a);
});

router.get('/:id', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  const participants = await Participant.find({ activity: a._id }).sort({ rollNumber: 1 });
  const studentRegCount = await StudentRegistration.countDocuments({ activity: a._id });
  res.json({ ...a.toObject(), participants, studentRegistrationCount: studentRegCount, canEdit: canEdit(req.user, a) });
});

router.put('/:id', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!canEdit(req.user, a)) return res.status(403).json({ message: 'Only drafts or rejected activities can be edited' });
  for (const k of ['title', 'academicYear', 'startDate', 'description', 'details', 'targetAudience']) {
    if (k in req.body) a[k] = req.body[k];
  }
  if ('endDate' in req.body) a.endDate = req.body.endDate || undefined;
  if ('isEnabled' in req.body) a.isEnabled = Boolean(req.body.isEnabled);
  if (a.status === 'rejected') a.status = 'draft';
  a.markModified('details');
  await a.save();
  res.json(a);
});

// PATCH /:id/toggle-enable — toggle student registration enabled state
router.patch('/:id/toggle-enable', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!isHodOrAdmin(req.user) && String(a.createdBy._id || a.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You do not have permission to enable/disable this activity' });
  }
  a.isEnabled = !a.isEnabled;
  await a.save();
  res.json(a);
});

// PATCH /:id/audience — change target audience
router.patch('/:id/audience', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!isHodOrAdmin(req.user) && String(a.createdBy._id || a.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You do not have permission to change target audience' });
  }
  const audience = req.body.targetAudience;
  if (!['Students', 'Faculty', 'Both'].includes(audience)) {
    return res.status(400).json({ message: 'Audience must be Students, Faculty, or Both' });
  }
  a.targetAudience = audience;
  await a.save();
  res.json(a);
});

// GET /:id/student-registrations — get student registrations for this specific activity
router.get('/:id/student-registrations', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  const regs = await StudentRegistration.find({ activity: a._id }).sort({ registeredAt: -1 }).lean();
  res.json(regs);
});

router.delete('/:id', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!canEdit(req.user, a)) return res.status(403).json({ message: 'You cannot delete this activity' });
  await Participant.deleteMany({ activity: a._id });
  await StudentRegistration.deleteMany({ activity: a._id });
  await a.deleteOne();
  res.json({ ok: true });
});

router.post('/:id/submit', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!canEdit(req.user, a)) return res.status(403).json({ message: 'You cannot submit this activity' });
  a.status = 'submitted'; a.reviewNote = ''; await a.save();
  res.json(a);
});

router.post('/:id/review', role('hod', 'admin'), async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (a.status !== 'submitted') return res.status(400).json({ message: 'Only submitted activities can be reviewed' });
  a.status = req.body.action === 'approve' ? 'approved' : 'rejected';
  a.reviewNote = req.body.note || '';
  await a.save();
  res.json(a);
});

router.post('/:id/participants', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!canEdit(req.user, a)) return res.status(403).json({ message: 'Participants are locked after submission' });
  const rows = (req.body.participants || []).filter((p) => p.rollNumber && p.rollNumber.trim());
  let added = 0;
  try {
    added = (await Participant.insertMany(rows.map((p) => ({ ...p, activity: a._id })), { ordered: false })).length;
  } catch (e) { added = e.insertedDocs ? e.insertedDocs.length : 0; }   // duplicate roll numbers are skipped
  res.json({ added, skipped: rows.length - added });
});

router.delete('/:id/participants/:pid', async (req, res) => {
  const a = await load(req, res); if (!a) return;
  if (!canEdit(req.user, a)) return res.status(403).json({ message: 'Participants are locked after submission' });
  await Participant.deleteOne({ _id: req.params.pid, activity: a._id });
  res.json({ ok: true });
});

module.exports = router;
