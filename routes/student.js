const router = require('express').Router();
const Activity = require('../models/Activity');
const StudentRegistration = require('../models/StudentRegistration');
const { auth } = require('../middleware/auth');
const { TYPES } = require('../config/types');
const unifiedIntegration = require('../services/unifiedIntegration');
const { fetchStudentByRollNumber } = require('../services/studentApiService');

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
 * GET /api/student/lookup/:rollNumber
 * Secure server-side lookup using the confidential Student API
 */
router.get('/lookup/:rollNumber', async (req, res) => {
  try {
    const student = await fetchStudentByRollNumber(req.params.rollNumber);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in official registry' });
    }
    return res.json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/student/activities
 * Public or authenticated list of activities available to students
 * Merges released activities from Unified Portal and local activities
 */
router.get('/activities', optionalAuth, async (req, res) => {
  try {
    const studentRoll = req.user?.rollNumber || '';

    // 1. Fetch published activities released from Unified Portal (Faculty Coordinator)
    let unifiedActivities = [];
    try {
      unifiedActivities = await unifiedIntegration.getPublishedUnifiedActivities({ rollNumber: studentRoll });
    } catch (uErr) {
      console.warn('Could not fetch Unified Portal activities:', uErr.message);
    }

    // Only activities where cards have been added and released by the Faculty Coordinator are visible to students
    res.json(unifiedActivities);
  } catch (err) {
    console.error('Error fetching student activities:', err);
    res.status(500).json({ message: 'Failed to retrieve activities' });
  }
});


/**
 * GET /api/student/activities/:id
 * Activity details & registration form configuration
 */
router.get('/activities/:id', optionalAuth, async (req, res) => {
  try {
    const actId = req.params.id;
    const studentRoll = req.user?.rollNumber || '';

    // 1. Check if this is a Unified activity
    try {
      const unifiedAct = await unifiedIntegration.getUnifiedActivityById(actId, { rollNumber: studentRoll });
      if (unifiedAct) {
        return res.json(unifiedAct);
      }
    } catch (uErr) {
      console.warn('Unified activity lookup warning:', uErr.message);
    }

    // 2. Fall back to local Activity
    const a = await Activity.findById(actId).lean();
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
    if (studentRoll) {
      const existing = await StudentRegistration.findOne({
        activity: a._id,
        rollNumber: studentRoll.toUpperCase()
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
      isRegistered,
      isUnified: false
    });
  } catch (err) {
    console.error('Error fetching activity details:', err);
    res.status(500).json({ message: 'Failed to retrieve activity details' });
  }
});

/**
 * POST /api/student/register/:id
 * Student registers for an activity (Unified Portal or Local)
 */
router.post('/register/:id', auth, studentAuth, async (req, res) => {
  try {
    const actId = req.params.id;
    const cleanRoll = String(req.user.rollNumber || req.body.rollNumber || '').toUpperCase().trim();

    if (!cleanRoll) {
      return res.status(400).json({ message: 'Roll number is required for registration' });
    }

    // 1. Check if this is a Unified Portal activity
    const unifiedAct = await unifiedIntegration.getUnifiedActivityById(actId, { rollNumber: cleanRoll });
    if (unifiedAct) {
      try {
        const regResult = await unifiedIntegration.registerStudentForUnifiedActivity(actId, {
          rollNumber: cleanRoll,
          studentName: req.body.studentName || req.body.participantName || req.user.name,
          email: req.body.email || req.user.email,
          phone: req.body.phone || '',
          branch: req.body.branch || req.body.department || req.user.department || 'CSE',
          gender: req.body.gender || 'Male',
          academicYear: req.body.academicYear || unifiedAct.academicYear || '2026-27'
        });

        if (regResult.alreadyRegistered) {
          try {
            await StudentRegistration.create({
              activity: unifiedAct._id,
              activityTitle: unifiedAct.title,
              activityType: unifiedAct.activityType || 'University Activity',
              rollNumber: cleanRoll,
              studentName: req.body.studentName || req.user.name || '',
              formData: {
                ...req.body,
                registrationId: regResult.registrationId,
                source: 'UNIFIED_PORTAL'
              }
            });
          } catch {}
          return res.status(409).json({ message: regResult.message });
        }

        // Also cache locally in StudentRegistration for student's /my-registrations
        try {
          await StudentRegistration.create({
            activity: unifiedAct._id,
            activityTitle: unifiedAct.title,
            activityType: unifiedAct.activityType || 'University Activity',
            rollNumber: cleanRoll,
            studentName: req.body.studentName || req.user.name || '',
            formData: {
              ...req.body,
              registrationId: regResult.registrationId,
              source: 'UNIFIED_PORTAL'
            }
          });
        } catch (cacheErr) {
          // ignore duplicate in local cache
        }

        return res.status(201).json({
          success: true,
          message: 'Successfully registered for activity!',
          ...regResult
        });
      } catch (uRegErr) {
        return res.status(400).json({ message: uRegErr.message || 'Unified registration error' });
      }
    }

    // 2. Handle Local Activity registration
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
      formData: req.body.formData || req.body
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
 * List current student's registered activities (Local & Unified)
 */
router.get('/my-registrations', auth, studentAuth, async (req, res) => {
  try {
    const rollNumber = String(req.user.rollNumber || '').toUpperCase().trim();
    if (!rollNumber) {
      return res.json([]);
    }

    const [unifiedRegs, regs] = await Promise.all([
      unifiedIntegration.getStudentUnifiedRegistrations(rollNumber).catch(() => []),
      StudentRegistration.find({ rollNumber })
        .populate('activity')
        .sort({ registeredAt: -1 })
        .lean()
    ]);

    const seenRegIds = new Set();
    const seenTitles = new Set();

    const unifiedFormatted = (unifiedRegs || []).map((u) => {
      if (u.formData?.registrationId) seenRegIds.add(u.formData.registrationId);
      if (u.activity?.title) seenTitles.add(u.activity.title);
      return u;
    });

    const localFormatted = [];
    for (const r of regs) {
      const regId = r.formData?.registrationId;
      const act = r.activity || {};
      const title = act.title || r.activityTitle || 'Registered Activity';
      if ((regId && seenRegIds.has(regId)) || (r.formData?.source === 'UNIFIED_PORTAL' && seenTitles.has(title))) {
        continue;
      }
      const typeKey = act.type || (r.activityType || '').toLowerCase().replace(/[^a-z]/g, '_');
      const typeInfo = TYPES[typeKey] || { label: r.activityType || act.type || 'Activity', color: '#2b4fd8' };
      localFormatted.push({
        _id: r._id,
        registeredAt: r.registeredAt,
        formData: r.formData || {},
        activity: {
          _id: act._id || r.activity,
          title,
          type: typeKey,
          activityType: typeInfo.label,
          department: act.department || '—',
          startDate: act.startDate,
          endDate: act.endDate
        },
        typeInfo
      });
    }

    const combined = [...unifiedFormatted, ...localFormatted].sort(
      (a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0)
    );

    res.json(combined);
  } catch (err) {
    console.error('Error fetching student registrations:', err);
    res.status(500).json({ message: 'Failed to retrieve your registrations' });
  }
});

module.exports = router;
