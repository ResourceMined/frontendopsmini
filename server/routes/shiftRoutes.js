import express from 'express';
import * as shiftService from '../services/shiftService.js';

const router = express.Router();

router.get('/shifts', shiftService.getShifts);

export default router;