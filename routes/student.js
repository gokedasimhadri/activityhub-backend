const router = require('express').Router();
const Activity = require('../models/Activity');
const StudentRegistration = require('../models/StudentRegistration');
const { auth } = require('../middleware/auth');
const { TYPES } = require('../config/types');

// Middleware: student-only authorization
const studentAuth = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Students only' });
  }
  next();
};

// Optional auth helper: populates req.user if valid token provided, but doesn't reject if not
const optionalAuth = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) {
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const { id } = jwt.verify(token, process.env.JWT_SECRET || 'activityhub_jwt_secret_aditya_univ');
      req.user = await User.findById(id).select('-password');
    }
  } catch {
    // Ignore invalid token in optionalAuth
  }
  next();
};

/**
 * GET /api/student/activities
 * Public or authenticated list of activities available to students
 * Returns activities that are enabled OR approved, and target audience is Students or Both
 */
router.get('/activities', optionalAuth, async (req, res) => {
  try {
    const studentRoll = req.user?.rollNumber || '';

    const query = {
      $and: [
        {
          $or: [
            { isEnabled: true },
            { status: 'approved', isEnabled: { $ne: false } }
          ]
        },
        {
          targetAudience: { $in: ['Students', 'Both', undefined, null] }
        }
      ]
    };

    const activities = await Activity.find(query)
      .sort({ startDate: -1 })
      .limit(200)
      .lean();

    // Fetch registration counts
    const actIds = activities.map((a) => a._id);
    const regCounts = await StudentRegistration.aggregate([
      { $match: { activity: { $in: actIds } } },
      { $group: { _id: '$activity', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(regCounts.map((r) => [String(r._id), r.count]));

    // Check which ones the student is registered for
    let myRegisteredSet = new Set();
    if (studentRoll) {
      const myRegs = await StudentRegistration.find({
        activity: { $in: actIds },
        rollNumber: studentRoll.toUpperCase()
      }).select('activity').lean();
      myRegisteredSet = new Set(myRegs.map((r) => String(r.activity)));
    }

    const result = activities.map((a) => {
      const typeInfo = TYPES[a.type] || { label: a.type, color: '#2b4fd8' };
      return {
        _id: a._id,
        title: a.title,
        type: a.type,
        activityType: typeInfo.label,
        typeInfo,
        department: a.department,
        academicYear: a.academicYear,
        startDate: a.startDate,
        endDate: a.endDate,
        description: a.description,
        targetAudience: a.targetAudience || 'Both',
        registrationCount: countMap[String(a._id)] || 0,
        isRegistered: myRegisteredSet.has(String(a._id)),
        isEnabled: a.isEnabled !== false
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching student activities:', err);
    res.status(500).json({ message: 'Failed to retrieve activities' });
  }
});

/**
 * GET /api/student/activities/:id
 * Single activity details with dynamic form fields based on TYPES
 */
router.get('/activities/:id', optionalAuth, async (req, res) => {
  try {
    const a = await Activity.findById(req.params.id).lean();
    if (!a) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (a.targetAudience === 'Faculty') {
      return res.status(403).json({ message: 'This activity is restricted to Faculty only' });
    }

    const typeConfig = TYPES[a.type];
    const typeInfo = typeConfig || { label: a.type, color: '#2b4fd8' };
    const fields = typeConfig?.fields || [
      { key: 'contactHours', label: 'Contact hours', type: 'number' },
      { key: 'resourcePerson', label: 'Resource person / Instructor', type: 'text' }
    ];

    let isRegistered = false;
    if (req.user?.rollNumber) {
      const existing = await StudentRegistration.findOne({
        activity: a._id,
        rollNumber: req.user.rollNumber.toUpperCase()
      });
      isRegistered = !!existing;
    }

    res.json({
      _id: a._id,
      title: a.title,
      type: a.type,
      activityType: typeInfo.label,
      typeInfo,
      fields,
      department: a.department,
      academicYear: a.academicYear,
      startDate: a.startDate,
      endDate: a.endDate,
      description: a.description,
      details: a.details || {},
      targetAudience: a.targetAudience || 'Both',
      isEnabled: a.isEnabled !== false,
      isRegistered
    });
  } catch (err) {
    console.error('Error fetching activity details:', err);
    res.status(500).json({ message: 'Failed to retrieve activity details' });
  }
});

/**
 * POST /api/student/register/:id
 * Student registers for an activity
 */
router.post('/register/:id', auth, studentAuth, async (req, res) => {
  try {
    const actId = req.params.id;
    const cleanRoll = String(req.user.rollNumber || req.body.rollNumber || '').toUpperCase().trim();

    if (!cleanRoll) {
      return res.status(400).json({ message: 'Roll number is required for registration' });
    }

    const activity = await Activity.findById(actId);
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (activity.targetAudience === 'Faculty') {
      return res.status(403).json({ message: 'This activity is restricted to Faculty only' });
    }

    if (activity.isEnabled === false && activity.status !== 'approved') {
      return res.status(400).json({ message: 'This activity is not currently accepting registrations' });
    }

    // Check duplicate registration
    const existing = await StudentRegistration.findOne({ activity: actId, rollNumber: cleanRoll });
    if (existing) {
      return res.status(409).json({ message: 'You have already registered for this activity' });
    }

    const typeInfo = TYPES[activity.type];
    const reg = await StudentRegistration.create({
      activity: activity._id,
      activityTitle: activity.title,
      activityType: typeInfo?.label || activity.type,
      rollNumber: cleanRoll,
      studentName: req.user.name || '',
      formData: req.body.formData || {}
    });

    res.status(201).json(reg);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You have already registered for this activity' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Failed to complete registration' });
  }
});

/**
 * GET /api/student/my-registrations
 * List current student's registered activities
 */
router.get('/my-registrations', auth, studentAuth, async (req, res) => {
  try {
    const rollNumber = String(req.user.rollNumber || '').toUpperCase().trim();
    if (!rollNumber) {
      return res.json([]);
    }

    const regs = await StudentRegistration.find({ rollNumber })
      .populate('activity')
      .sort({ registeredAt: -1 })
      .lean();

    const formatted = regs.map((r) => {
      const act = r.activity || {};
      const typeKey = act.type || (r.activityType || '').toLowerCase().replace(/[^a-z]/g, '_');
      const typeInfo = TYPES[typeKey] || { label: r.activityType || act.type || 'Activity', color: '#2b4fd8' };
      return {
        _id: r._id,
        registeredAt: r.registeredAt,
        formData: r.formData || {},
        activity: {
          _id: act._id || r.activity,
          title: act.title || r.activityTitle || 'Registered Activity',
          type: typeKey,
          activityType: typeInfo.label,
          department: act.department || '—',
          startDate: act.startDate,
          endDate: act.endDate
        },
        typeInfo
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching student registrations:', err);
    res.status(500).json({ message: 'Failed to retrieve your registrations' });
  }
});

module.exports = router;
