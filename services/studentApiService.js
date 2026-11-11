const https = require('https');

const STUDENT_API_URL = process.env.STUDENT_API_URL;
const STUDENT_API_KEY = process.env.STUDENT_API_KEY || process.env.ECAP_API_KEY;

/**
 * Fetch official student data by Roll Number from AEC Student API using native https
 * @param {string} rollNo 
 * @returns {Promise<Object|null>}
 */
function fetchStudentByRollNumber(rollNo) {
  return new Promise((resolve) => {
    if (!rollNo) return resolve(null);
    if (!STUDENT_API_URL || !STUDENT_API_KEY) {
      console.warn('STUDENT_API_URL or STUDENT_API_KEY missing in .env');
      return resolve(null);
    }
    const cleanRoll = String(rollNo).trim().toUpperCase();

    try {
      const urlObj = new URL(`${STUDENT_API_URL.replace(/\/$/, '')}/${encodeURIComponent(cleanRoll)}`);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'GET',
        headers: {
          'x-api-key': STUDENT_API_KEY
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const data = JSON.parse(raw);
              const list = Array.isArray(data) ? data : (data ? [data] : []);
              if (list.length > 0 && !list[0].error && (list[0].studentname || list[0].rollno)) {
                const s = list[0];
                return resolve({
                  rollNumber: s.rollno || cleanRoll,
                  name: s.studentname || '',
                  email: s.emailid || `${cleanRoll.toLowerCase()}@adityauniversity.in`,
                  mobile: s.mobilenumber || '',
                  department: s.branch || '',
                  branch: s.branch || '',
                  course: s.coursename || 'B.Tech',
                  semester: s.semestername || '',
                  batch: s.joinedbatch || s.acadamicbatch || '',
                  gender: s.gender || '',
                  status: s.studentstatus || 'Active'
                });
              }
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.on('error', (err) => {
        console.warn(`Student API request error for ${cleanRoll}:`, err.message);
        resolve(null);
      });

      req.end();
    } catch (err) {
      console.warn(`Student API URL parse error:`, err.message);
      resolve(null);
    }
  });
}

module.exports = {
  fetchStudentByRollNumber
};
