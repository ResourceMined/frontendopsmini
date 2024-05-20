import express from 'express';
import * as taskService from '../services/taskService.js';

const router = express.Router();

router.get('/tasks', taskService.getTasks);
router.post('/updateTask', taskService.updateTask);
router.post('/startTask', taskService.startTask);
router.post('/finishTask', taskService.finishTask);

export default router;