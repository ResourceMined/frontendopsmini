import 'dotenv/config';

export default {
  API_URL: process.env.API_URL || 'https://opstanamitest.newmont.com/api/external/v3.7',
  SHIFT_URL: process.env.SHIFT_URL || 'https://opstanamitest.newmont.com/api/external/v3.7/Shifts',
  API_TOKEN: process.env.API_TOKEN,
  ACTIVITY_DEFINITION_URL: process.env.ACTIVITY_DEFINITION_URL,
  WORKPLACE_URL: process.env.WORKPLACE_URL,
  MATERIAL_URL: process.env.MATERIAL_URL,
  METRIC_URL: process.env.METRIC_URL,
  PORT: process.env.PORT || 5000,
};