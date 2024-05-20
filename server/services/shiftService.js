import * as apiUtils from '../utils/apiUtils.js';
import config from '../config/config.js';

export const getShifts = async (req, res) => {
  try {
    const { StartDate, EndDate } = req.query;
    if (!StartDate || !EndDate) {
      return res.status(400).json({ message: "StartDate and EndDate are required." });
    }

    const data = await apiUtils.fetchData(`${config.SHIFT_URL}`, { StartDate, EndDate });
    res.json(data);
  } catch (error) {
    console.error('Error retrieving shifts:', error);
    apiUtils.handleError(res, error);
  }
};