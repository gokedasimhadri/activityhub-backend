// Activity types, based on Aditya University data collection forms (Form 2, 5, 6)
const TYPES = {
  kedar: {
    label: 'kedar', form: 'AUS/Academics/Form2.5', color: '#2b4fd8', fields: [
      { key: 'contactHours', label: 'Contact hours', type: 'number' },
      { key: 'resourcePerson', label: 'Resource person / Instructor', type: 'text' }]
  },
  workshop: {
    label: 'Workshop', form: 'AUS/Academics/Form2.6', color: '#2b4fd8', fields: [
      { key: 'contactHours', label: 'Contact hours', type: 'number' },
      { key: 'resourcePerson', label: 'Resource person / Instructor', type: 'text' }]
  },
  guest_lecture: {
    label: 'Guest Lecture', form: 'AUS/Academics/Form2.7', color: '#0f9d8a', fields: [
      { key: 'resourcePerson', label: 'Resource person', type: 'text' }]
  },
  value_added_course: {
    label: 'Value Added Course', form: 'AUS/Academics/Form2.5', color: '#b45309', fields: [
      { key: 'contactHours', label: 'Contact hours', type: 'number' },
      { key: 'resourcePerson', label: 'Instructor', type: 'text' }]
  },
  professional_body: {
    label: 'Professional Body Activity', form: 'AUS/Academics/Form2.8', color: '#7c3aed', fields: [
      { key: 'professionalBody', label: 'Professional body (IEEE, CSI...)', type: 'text' },
      { key: 'resourcePerson', label: 'Faculty coordinator / Resource person', type: 'text' }]
  },
  capacity_development: {
    label: 'Capacity Development', form: 'AUS/Academics/Form2.9', color: '#db2777', fields: [
      { key: 'category', label: 'Category', type: 'select', options: ['Soft Skills', 'Life Skills', 'Language and Communication Skills', 'Other'] },
      { key: 'resourcePerson', label: 'Resource person', type: 'text' }]
  },
  industrial_visit: {
    label: 'Industrial Visit', form: 'AUS/Academics/Form2.10', color: '#0369a1', fields: [
      { key: 'industry', label: 'Industry visited', type: 'text' },
      { key: 'place', label: 'Place of visit', type: 'text' },
      { key: 'semester', label: 'Semester', type: 'text' },
      { key: 'classSection', label: 'Class / Section', type: 'text' }]
  },
  alumni_interaction: {
    label: 'Alumni Interaction', form: 'AUS/Academics/Form2.11', color: '#65a30d', fields: [
      { key: 'alumniName', label: 'Alumni name', type: 'text' },
      { key: 'organization', label: 'Alumni organization', type: 'text' }]
  },
  fdp_pdp: {
    label: 'FDP / PDP', form: 'AUS/Academics/Form2.14', color: '#4338ca', fields: [
      { key: 'kind', label: 'FDP or PDP', type: 'select', options: ['FDP', 'PDP'] },
      { key: 'resourcePerson', label: 'Resource person(s)', type: 'text' }]
  },
  club_activity: {
    label: 'Club Activity', form: 'AUS/Student affairs/Form5.5', color: '#ea580c', fields: [
      { key: 'club', label: 'Name of the club', type: 'text' }]
  },
  outreach: {
    label: 'Extension & Outreach', form: 'AUS/Student affairs/Form5.4', color: '#15803d', fields: [
      { key: 'unit', label: 'Organizing unit', type: 'select', options: ['NSS', 'NCC', 'YRCS', 'Leo Club', 'Eco Club', 'Other'] },
      { key: 'venue', label: 'Venue / Location', type: 'text' }]
  },
  entrepreneurship: {
    label: 'Entrepreneurship Event', form: 'AUS/Career development/Form6.2', color: '#be123c', fields: [
      { key: 'eventType', label: 'Event type', type: 'select', options: ['Workshop', 'Bootcamp', 'Competition', 'Other'] },
      { key: 'organizedBy', label: 'Organized by', type: 'select', options: ['EDC', 'IIC', 'Department'] },
      { key: 'outcome', label: 'Outcome / Highlights', type: 'text' }]
  }
};
const DEPARTMENTS = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'MCA', 'MBA', 'Sciences & Humanities'];
module.exports = { TYPES, DEPARTMENTS };
