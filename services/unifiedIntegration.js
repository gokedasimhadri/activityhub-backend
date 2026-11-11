const mongoose = require('mongoose');

const UNIFIED_DB_URI = process.env.UNIFIED_DB_URI;

let unifiedConn = null;
let EcapActivity = null;
let CentralEventStudentRegistration = null;

const getUnifiedConnection = () => {
  // Reuse active OR in-progress connection so concurrent calls never overwrite an active handshake
  if (unifiedConn && (unifiedConn.readyState === 1 || unifiedConn.readyState === 2)) {
    return unifiedConn;
  }

  if (!UNIFIED_DB_URI) {
    console.warn('ActivityHub: UNIFIED_DB_URI is not set in .env');
    return null;
  }

  try {
    unifiedConn = mongoose.createConnection(UNIFIED_DB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      heartbeatFrequencyMS: 10000,
      maxPoolSize: 10,
    });

    unifiedConn.on('connected', () => {
      console.log('ActivityHub: Connected to Unified Portal Database (digital_services) successfully');
    });

    unifiedConn.on('error', (err) => {
      console.warn('ActivityHub: Unified DB connection warning:', err.message);
    });

    // 1. EcapActivity Schema
    const ecapActivitySchema = new mongoose.Schema({
      approvalNumber: { type: String, trim: true, index: true },
      ecapActivityId: { type: String, trim: true, index: true },
      activityName: { type: String, required: true },
      deanCategory: { type: String },
      academicYear: { type: String, default: '2026-27' },
      activityDate: { type: Date },
      endDate: { type: Date },
      venue: { type: String, default: '' },
      activityType: { type: String, default: 'Workshop' },
      targetAudience: { type: String, default: 'Both' },
      status: { type: String, default: 'Approved' },
      description: { type: String, default: '' },
      isRegistrationPublished: { type: Boolean, default: false, index: true },
      registrationConfig: {
        applicableBoys: { type: Boolean, default: true },
        applicableGirls: { type: Boolean, default: true },
        applicableHostlers: { type: Boolean, default: false },
        hasFee: { type: String, enum: ['Yes', 'No'], default: 'No' },
        amount: { type: String, default: '' },
        audienceType: { type: String, default: 'Both Student & Faculty' },
        academicYear: { type: String, default: '2026-27' },
        publishedAt: { type: Date },
        publishedByFacultyId: { type: String, default: '' },
        publishedByFacultyName: { type: String, default: '' },
      },
      registeredParticipants: [{
        registrationId: String,
        userType: String,
        institutionId: String,
        userName: String,
        department: String,
        email: String,
        phone: String,
        gender: String,
        academicYear: String,
        registeredAt: { type: Date, default: Date.now },
      }],
      facultyCoordinator: {
        name: String,
        facultyId: String,
        email: String,
        department: String,
      },
      studentCoordinator: {
        name: String,
        rollNumber: String,
      }
    }, { collection: 'ecap_activities', timestamps: true });

    // 2. CentralEventStudentRegistration Schema
    const participantSubSchema = new mongoose.Schema({
      name: { type: String, default: '' },
      rollNumber: { type: String, default: '' },
      institutionId: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      college: { type: String, default: 'Aditya University' },
      department: { type: String, default: '' },
      branch: { type: String, default: '' },
      gender: { type: String, default: '' },
      userType: { type: String, default: 'STUDENT' }
    }, { _id: false });

    const centralRegSchema = new mongoose.Schema({
      academic_year: { type: String, required: true },
      event_name: { type: String, required: true },
      nature: { type: String, default: 'Other' },
      within_state: { type: String, default: 'Yes' },
      start_date: { type: Date, default: Date.now },
      end_date: { type: Date, default: Date.now },
      host_institution: { type: String, default: 'Aditya University' },
      student_name: { type: String, required: true },
      roll_number: { type: String, required: true, uppercase: true, index: true },
      typeCode: { type: String, default: 'UNIVERSITY', index: true },
      registrationNumber: { type: String, index: true },
      ecapActivityId: { type: String, default: '', index: true },
      approvalNumber: { type: String, default: '', index: true },
      eventTitle: { type: String },
      userType: { type: String, default: 'STUDENT', index: true },
      participant: participantSubSchema,
      fee: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' }
      },
      payment: {
        status: { type: String, default: 'FREE' },
        amount: { type: Number, default: 0 },
        paidAt: { type: Date, default: Date.now }
      },
      status: { type: String, default: 'CONFIRMED' },
      created_by: { type: String, default: 'activity_hub_student_portal' },
      created_at: { type: Date, default: Date.now },
      updated_at: { type: Date, default: Date.now },
    }, { collection: 'central_event_student_registrations' });

    EcapActivity = unifiedConn.models.EcapActivity || unifiedConn.model('EcapActivity', ecapActivitySchema);
    CentralEventStudentRegistration = unifiedConn.models.CentralEventStudentRegistration || unifiedConn.model('CentralEventStudentRegistration', centralRegSchema);

    return unifiedConn;
  } catch (err) {
    console.warn('ActivityHub: Could not initialize Unified DB connection:', err.message);
    return null;
  }
};

const ensureUnifiedConnection = async () => {
  const conn = getUnifiedConnection();
  if (!conn) return null;
  if (conn.readyState !== 1) {
    await conn.asPromise();
  }
  return conn;
};

// Initialize connection immediately
getUnifiedConnection();

/**
 * Fetch all released/published activities for students from the Unified Portal
 */
const getPublishedUnifiedActivities = async ({ rollNumber = '' } = {}) => {
  try {
    await ensureUnifiedConnection();
    if (!EcapActivity) return [];

    const query = {
      isRegistrationPublished: true,
      $or: [
        { 'registrationConfig.audienceType': { $in: ['Student', 'Both Student & Faculty', 'Both', 'Students'] } },
        { targetAudience: { $in: ['Student', 'Both Student & Faculty', 'Both', 'Students'] } },
        { 'registrationConfig.audienceType': { $exists: false } }
      ]
    };

    const activities = await EcapActivity.find(query)
      .sort({ activityDate: -1, createdAt: -1 })
      .lean();

    if (!activities || activities.length === 0) return [];

    const approvalNumbers = activities.map(a => a.approvalNumber).filter(Boolean);
    const activityNames = activities.map(a => a.activityName).filter(Boolean);

    // Check student registrations if rollNumber is provided
    let registeredApprovalSet = new Set();
    let registeredNameSet = new Set();

    if (rollNumber && CentralEventStudentRegistration) {
      const cleanRoll = String(rollNumber).toUpperCase().trim();
      const studentRegs = await CentralEventStudentRegistration.find({
        roll_number: cleanRoll,
        $or: [
          { approvalNumber: { $in: approvalNumbers } },
          { event_name: { $in: activityNames } }
        ]
      }).select('approvalNumber event_name').lean();

      studentRegs.forEach(r => {
        if (r.approvalNumber) registeredApprovalSet.add(r.approvalNumber);
        if (r.event_name) registeredNameSet.add(r.event_name);
      });
    }

    return activities.map(act => {
      const isReg = Boolean(
        (act.approvalNumber && registeredApprovalSet.has(act.approvalNumber)) ||
        (act.activityName && registeredNameSet.has(act.activityName)) ||
        (rollNumber && Array.isArray(act.registeredParticipants) && act.registeredParticipants.some(p => String(p.institutionId || '').toUpperCase() === String(rollNumber).toUpperCase()))
      );

      const fee = act.registrationConfig?.hasFee === 'Yes'
        ? parseFloat(act.registrationConfig.amount) || 0
        : 0;

      return {
        _id: String(act._id),
        activityId: act.ecapActivityId || String(act._id),
        approvalNumber: act.approvalNumber || '',
        title: act.activityName,
        type: act.activityType || 'Workshop',
        activityType: act.activityType || 'Workshop',
        department: act.deanCategory || 'University Central',
        deanCategory: act.deanCategory || '',
        academicYear: act.registrationConfig?.academicYear || act.academicYear || '2026-27',
        startDate: act.activityDate || new Date(),
        endDate: act.endDate || act.activityDate || new Date(),
        venue: act.venue || 'Aditya University Campus',
        description: act.description || `Official university activity sanctioned by ${act.deanCategory || 'Academic Council'}.`,
        targetAudience: act.registrationConfig?.audienceType || act.targetAudience || 'Both',
        registrationCount: Array.isArray(act.registeredParticipants) ? act.registeredParticipants.length : 0,
        isRegistered: isReg,
        isUnified: true,
        source: 'UNIFIED_PORTAL',
        fee: {
          hasFee: act.registrationConfig?.hasFee === 'Yes',
          amount: fee,
        },
        eligibility: {
          applicableBoys: act.registrationConfig?.applicableBoys ?? true,
          applicableGirls: act.registrationConfig?.applicableGirls ?? true,
          applicableHostlers: act.registrationConfig?.applicableHostlers ?? false,
        },
        coordinator: {
          facultyName: act.facultyCoordinator?.name || act.registrationConfig?.publishedByFacultyName || 'Faculty Coordinator',
          facultyId: act.facultyCoordinator?.facultyId || act.registrationConfig?.publishedByFacultyId || '',
        }
      };
    });
  } catch (err) {
    console.error('Error fetching published unified activities:', err.message);
    return [];
  }
};

/**
 * Get single published Unified activity details by ID
 */
const getUnifiedActivityById = async (id, { rollNumber = '' } = {}) => {
  try {
    await ensureUnifiedConnection();
    if (!EcapActivity) return null;

    let act = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      act = await EcapActivity.findById(id).lean();
    }
    if (!act) {
      act = await EcapActivity.findOne({
        $or: [
          { approvalNumber: id },
          { ecapActivityId: id }
        ]
      }).lean();
    }

    if (!act || !act.isRegistrationPublished) return null;

    const matchClauses = [
      act.approvalNumber ? { approvalNumber: act.approvalNumber } : null,
      act.activityName ? { event_name: act.activityName } : null,
      act.ecapActivityId ? { ecapActivityId: act.ecapActivityId } : null,
    ].filter(Boolean);

    let isReg = false;
    if (rollNumber && CentralEventStudentRegistration && matchClauses.length > 0) {
      const cleanRoll = String(rollNumber).toUpperCase().trim();
      const existing = await CentralEventStudentRegistration.findOne({
        roll_number: cleanRoll,
        $or: matchClauses
      }).lean();

      const inArray = Array.isArray(act.registeredParticipants) && act.registeredParticipants.some(
        p => String(p.institutionId || '').toUpperCase() === cleanRoll
      );

      isReg = Boolean(existing || inArray);
    }

    const fee = act.registrationConfig?.hasFee === 'Yes'
      ? parseFloat(act.registrationConfig.amount) || 0
      : 0;

    return {
      _id: String(act._id),
      activityId: act.ecapActivityId || String(act._id),
      approvalNumber: act.approvalNumber || '',
      title: act.activityName,
      type: act.activityType || 'Workshop',
      activityType: act.activityType || 'Workshop',
      department: act.deanCategory || 'University Central',
      deanCategory: act.deanCategory || '',
      academicYear: act.registrationConfig?.academicYear || act.academicYear || '2026-27',
      startDate: act.activityDate || new Date(),
      endDate: act.endDate || act.activityDate || new Date(),
      venue: act.venue || 'Aditya University Campus',
      description: act.description || `Official university activity sanctioned by ${act.deanCategory || 'Academic Council'}.`,
      targetAudience: act.registrationConfig?.audienceType || act.targetAudience || 'Both',
      isRegistered: isReg,
      isUnified: true,
      source: 'UNIFIED_PORTAL',
      registrationConfig: act.registrationConfig || {},
      fee: {
        hasFee: act.registrationConfig?.hasFee === 'Yes',
        amount: fee,
      },
      eligibility: {
        applicableBoys: act.registrationConfig?.applicableBoys ?? true,
        applicableGirls: act.registrationConfig?.applicableGirls ?? true,
        applicableHostlers: act.registrationConfig?.applicableHostlers ?? false,
      },
      coordinator: {
        facultyName: act.facultyCoordinator?.name || act.registrationConfig?.publishedByFacultyName || 'Faculty Coordinator',
        facultyId: act.facultyCoordinator?.facultyId || act.registrationConfig?.publishedByFacultyId || '',
      }
    };
  } catch (err) {
    console.error('Error fetching single unified activity:', err.message);
    return null;
  }
};

/**
 * Register a student for a Unified activity
 * Saves directly into `central_event_student_registrations` with `typeCode: 'UNIVERSITY'`
 * and appends to `activity.registeredParticipants` in `ecap_activities`
 */
const registerStudentForUnifiedActivity = async (activityId, studentData) => {
  try {
    await ensureUnifiedConnection();
    if (!EcapActivity || !CentralEventStudentRegistration) {
      throw new Error('Unified database connection is not ready');
    }

    let act = null;
    if (mongoose.Types.ObjectId.isValid(activityId)) {
      act = await EcapActivity.findById(activityId).lean();
    }
    if (!act) {
      act = await EcapActivity.findOne({
        $or: [
          { approvalNumber: activityId },
          { ecapActivityId: activityId }
        ]
      }).lean();
    }

    if (!act) {
      throw new Error('Activity not found in Unified Portal');
    }

    if (!act.isRegistrationPublished) {
      throw new Error('This activity is not currently published for registration');
    }

    const cleanRoll = String(studentData.rollNumber || studentData.institutionId || '').toUpperCase().trim();
    if (!cleanRoll) {
      throw new Error('Roll number is required for registration');
    }

    const matchClauses = [
      act.approvalNumber ? { approvalNumber: act.approvalNumber } : null,
      act.activityName ? { event_name: act.activityName } : null,
      act.ecapActivityId ? { ecapActivityId: act.ecapActivityId } : null,
    ].filter(Boolean);

    // 1. Check duplicate registration
    const existing = matchClauses.length > 0
      ? await CentralEventStudentRegistration.findOne({
          roll_number: cleanRoll,
          $or: matchClauses
        }).lean()
      : null;

    const inArray = Array.isArray(act.registeredParticipants) && act.registeredParticipants.some(
      p => String(p.institutionId || '').toUpperCase() === cleanRoll
    );

    if (existing && !inArray) {
      // Backfill ecap_activities.registeredParticipants if central registration already exists
      await EcapActivity.updateOne(
        { _id: act._id, 'registeredParticipants.institutionId': { $ne: cleanRoll } },
        {
          $push: {
            registeredParticipants: {
              registrationId: existing.registrationNumber || 'REG-EXISTING',
              userType: 'STUDENT',
              institutionId: cleanRoll,
              userName: existing.student_name || studentData.studentName || `Student (${cleanRoll})`,
              department: existing.participant?.branch || studentData.branch || 'CSE',
              email: existing.participant?.email || studentData.email || '',
              phone: existing.participant?.phone || studentData.phone || '',
              gender: existing.participant?.gender || studentData.gender || 'Male',
              academicYear: existing.academic_year || '2026-27',
              registeredAt: existing.created_at || new Date()
            }
          }
        }
      );
    }

    if (existing || inArray) {
      return {
        alreadyRegistered: true,
        registrationId: existing?.registrationNumber || 'REG-EXISTING',
        message: 'You have already registered for this activity!'
      };
    }

    // Normalize academic year (must conform to ^\d{4}-\d{2}$ for collection schema)
    let acYear = studentData.academicYear || act.registrationConfig?.academicYear || act.academicYear || '2026-27';
    if (/^\d{4}-\d{4}$/.test(acYear)) {
      acYear = acYear.slice(0, 5) + acYear.slice(7);
    } else if (/^\d{4}$/.test(acYear)) {
      const y = parseInt(acYear, 10);
      acYear = `${y}-${String(y + 1).slice(-2)}`;
    }

    const studentName = studentData.studentName || studentData.name || `Student (${cleanRoll})`;
    const email = studentData.email || '';
    const phone = studentData.phone || '';
    const branch = studentData.branch || studentData.department || 'CSE';
    const gender = studentData.gender || 'Male';

    const regId = `UNIV-${Date.now().toString(36).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const feeAmount = (act.registrationConfig?.hasFee === 'Yes' && act.registrationConfig?.amount)
      ? (parseFloat(act.registrationConfig.amount) || 0)
      : 0;

    const now = new Date();
    const startDate = act.activityDate ? new Date(act.activityDate) : now;
    const endDate = act.endDate ? new Date(act.endDate) : startDate;

    // 2. Save directly to central_event_student_registrations
    const newReg = new CentralEventStudentRegistration({
      academic_year: acYear,
      event_name: act.activityName,
      nature: 'Other',
      within_state: 'Yes',
      start_date: startDate,
      end_date: endDate,
      host_institution: 'Aditya University',
      student_name: studentName,
      roll_number: cleanRoll,
      typeCode: 'UNIVERSITY',
      registrationNumber: regId,
      ecapActivityId: act.ecapActivityId || '',
      approvalNumber: act.approvalNumber || '',
      eventTitle: act.activityName,
      userType: 'STUDENT',
      participant: {
        name: studentName,
        rollNumber: cleanRoll,
        institutionId: cleanRoll,
        email,
        phone,
        college: 'Aditya University',
        department: branch,
        branch: branch,
        gender,
        userType: 'STUDENT'
      },
      fee: {
        amount: feeAmount,
        currency: 'INR'
      },
      payment: {
        status: feeAmount === 0 ? 'FREE' : 'PENDING',
        amount: feeAmount,
        paidAt: feeAmount === 0 ? now : null
      },
      status: 'CONFIRMED',
      created_by: 'student_portal_integration',
      created_at: now,
      updated_at: now
    });

    await newReg.save();

    // 3. Atomically append to registeredParticipants in ecap_activities (avoids full-document __v conflict)
    await EcapActivity.updateOne(
      { _id: act._id, 'registeredParticipants.institutionId': { $ne: cleanRoll } },
      {
        $push: {
          registeredParticipants: {
            registrationId: regId,
            userType: 'STUDENT',
            institutionId: cleanRoll,
            userName: studentName,
            department: branch,
            email,
            phone,
            gender,
            academicYear: acYear,
            registeredAt: now
          }
        }
      }
    );

    return {
      success: true,
      registrationId: regId,
      activityTitle: act.activityName,
      studentName,
      rollNumber: cleanRoll,
      academicYear: acYear,
      registeredAt: now
    };
  } catch (err) {
    console.error('Error registering student for unified activity:', err);
    throw err;
  }
};

/**
 * Fetch registrations for a specific Unified activity (for faculty coordinator view)
 */
const getUnifiedActivityRegistrations = async (activityId) => {
  try {
    await ensureUnifiedConnection();
    if (!EcapActivity || !CentralEventStudentRegistration) return [];

    let act = null;
    if (mongoose.Types.ObjectId.isValid(activityId)) {
      act = await EcapActivity.findById(activityId).lean();
    }
    if (!act) {
      act = await EcapActivity.findOne({
        $or: [
          { approvalNumber: activityId },
          { ecapActivityId: activityId }
        ]
      }).lean();
    }

    if (!act) return [];

    const matchClauses = [
      act.approvalNumber ? { approvalNumber: act.approvalNumber } : null,
      act.activityName ? { event_name: act.activityName } : null,
      act.ecapActivityId ? { ecapActivityId: act.ecapActivityId } : null,
    ].filter(Boolean);

    if (matchClauses.length === 0) return [];

    // Query registrations from central_event_student_registrations
    const regs = await CentralEventStudentRegistration.find({
      $or: matchClauses
    }).sort({ created_at: -1 }).lean();

    return regs.map(r => ({
      registrationId: r.registrationNumber,
      rollNumber: r.roll_number,
      studentName: r.student_name,
      email: r.participant?.email || '',
      phone: r.participant?.phone || '',
      branch: r.participant?.branch || r.participant?.department || '',
      gender: r.participant?.gender || '',
      academicYear: r.academic_year,
      registeredAt: r.created_at,
      status: r.status,
      fee: r.fee?.amount || 0,
      paymentStatus: r.payment?.status || 'FREE'
    }));
  } catch (err) {
    console.error('Error fetching unified activity registrations:', err.message);
    return [];
  }
};

/**
 * Fetch all Unified Portal registrations for a specific student (roll number)
 */
const getStudentUnifiedRegistrations = async (rollNumber) => {
  try {
    await ensureUnifiedConnection();
    if (!CentralEventStudentRegistration || !rollNumber) return [];

    const cleanRoll = String(rollNumber).toUpperCase().trim();
    const regs = await CentralEventStudentRegistration.find({
      roll_number: cleanRoll,
      typeCode: 'UNIVERSITY'
    }).sort({ created_at: -1 }).lean();

    if (!regs.length) return [];

    const approvalNumbers = regs.map(r => r.approvalNumber).filter(Boolean);
    const eventNames = regs.map(r => r.event_name).filter(Boolean);

    const acts = EcapActivity
      ? await EcapActivity.find({
          $or: [
            ...(approvalNumbers.length ? [{ approvalNumber: { $in: approvalNumbers } }] : []),
            ...(eventNames.length ? [{ activityName: { $in: eventNames } }] : [])
          ]
        }).lean()
      : [];

    const actByApproval = new Map(acts.filter(a => a.approvalNumber).map(a => [a.approvalNumber, a]));
    const actByName = new Map(acts.filter(a => a.activityName).map(a => [a.activityName, a]));

    return regs.map(r => {
      const act = (r.approvalNumber && actByApproval.get(r.approvalNumber)) || actByName.get(r.event_name) || {};
      return {
        _id: String(r._id),
        registeredAt: r.created_at || r.updated_at,
        formData: {
          registrationId: r.registrationNumber,
          rollNumber: r.roll_number,
          studentName: r.student_name,
          email: r.participant?.email || '',
          phone: r.participant?.phone || '',
          branch: r.participant?.branch || r.participant?.department || '',
          gender: r.participant?.gender || '',
          academicYear: r.academic_year,
          source: 'UNIFIED_PORTAL'
        },
        activity: {
          _id: act._id ? String(act._id) : String(r._id),
          title: r.event_name || r.eventTitle || act.activityName || 'University Activity',
          type: act.activityType || 'University Activity',
          activityType: act.activityType || 'University Activity',
          department: act.deanCategory || r.participant?.branch || 'University Central',
          startDate: r.start_date || act.activityDate,
          endDate: r.end_date || act.endDate
        },
        typeInfo: { label: act.activityType || 'University Activity', color: '#2b4fd8' },
        source: 'UNIFIED_PORTAL'
      };
    });
  } catch (err) {
    console.error('Error fetching student unified registrations:', err.message);
    return [];
  }
};

module.exports = {
  getUnifiedConnection,
  ensureUnifiedConnection,
  getPublishedUnifiedActivities,
  getUnifiedActivityById,
  registerStudentForUnifiedActivity,
  getUnifiedActivityRegistrations,
  getStudentUnifiedRegistrations
};

