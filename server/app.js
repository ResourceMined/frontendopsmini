import express from 'express';
import cors from 'cors';
import axios from 'axios';
import https from 'https';
import config from './config/config.js';

const app = express();

// Enable CORS for all origins
app.use(cors());

app.use(express.json());

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Fetch data from an API
const fetchData = async (url, token, params) => {
  try {
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        ApiToken: token,
      },
      params,
      httpsAgent: httpsAgent,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

// Convert date to Darwin time
const convertToDarwinTime = (date) => {
  const darwinOffset = 0;
  return new Date(date.getTime() + darwinOffset);
};

// Fetch and cache all necessary details concurrently
const fetchAllDetails = async (startDate, endDate) => {
  try {
    const [
      activityDefinitionsData,
      workplacesData,
      materialsData,
      metricsData,
      shiftsData,
    ] = await Promise.all([
      fetchData(config.ACTIVITY_DEFINITION_URL, config.API_TOKEN),
      fetchData(config.WORKPLACE_URL, config.API_TOKEN),
      fetchData(config.MATERIAL_URL, config.API_TOKEN),
      fetchData(config.METRIC_URL, config.API_TOKEN),
      fetchData(config.SHIFT_URL, config.API_TOKEN, {
        StartDate: startDate,
        EndDate: endDate,
      }),
    ]);

    return {
      activityDefinitions: new Map(activityDefinitionsData.ActivityDefinitions.map(ad => [ad.Id, ad])),
      workplaces: new Map(workplacesData.Locations.map(wp => [wp.Id, wp])),
      materials: new Map(materialsData.Materials.map(mat => [mat.Id, mat])),
      metrics: new Map(metricsData.Metrics.map(met => [met.Id, met])),
      shifts: new Map(shiftsData.Shifts.map(shift => [shift.Id, shift])),
    };
  } catch (error) {
    console.error('Error fetching details:', error);
    throw error;
  }
};

// Enhance task data with readable information
const enhanceTaskData = async (tasks) => {
  try {
    const { activityDefinitions, workplaces, materials, metrics, shifts } = await fetchAllDetails();

    return tasks.flatMap(task => {
      const activityDefinition = activityDefinitions.get(task.ActivityDefinitionId);
      const workplace = workplaces.get(task.WorkplaceId);
      const material = materials.get(task.PlannedMaterialId);

      const plannedMetrics = task.PlannedMetrics.map(metric => {
        const metricInfo = metrics.get(metric.MetricId);
        return {
          MetricId: metric.MetricId,
          Metric: metricInfo ? metricInfo.Name : 'Unknown',
          Value: metric.Value,
        };
      });

      const actualMetrics = task.ActualProductionRecords.map(record => {
        return record.ActualMetrics.map(metric => {
          const metricInfo = metrics.get(metric.MetricId);
          return {
            MetricId: metric.MetricId,
            Metric: metricInfo ? metricInfo.Name : 'Unknown',
            Value: metric.Value,
          };
        });
      });

      return task.ShiftIds.map(taskShiftId => {
        const shift = shifts.get(taskShiftId);

        let startDateTime = 'Unknown';
        let endDateTime = 'Unknown';

        if (shift) {
          const shiftStartDate = new Date(`${shift.ShiftDate}T${shift.ShiftStartTime}:00Z`);
          const shiftEndDate = new Date(shiftStartDate.getTime() + 12 * 60 * 60 * 1000); // Add 12 hours for end date

          startDateTime = convertToDarwinTime(shiftStartDate).toISOString(); // Adjust to Darwin timezone
          endDateTime = convertToDarwinTime(shiftEndDate).toISOString(); // Adjust to Darwin timezone
        }

        return {
          Id: task.Id,
          ActivityRecordId: task.ActivityRecordId,
          ActivityDistributionIndex: task.ActivityDistributionIndex,
          ShiftId: taskShiftId,
          ShiftName: shift ? `${shift.ShiftDate}: ${shift.ShiftName}` : 'Unknown',
          ActivityType: activityDefinition ? activityDefinition.Name : 'Unknown',
          ActivityColor: activityDefinition ? activityDefinition.Color : '#000000',
          Location: workplace ? workplace.Name : 'Unknown',
          StartDateTime: startDateTime,
          FinishDateTime: endDateTime,
          PlannedQuantity: task.PlannedQuantity,
          Material: material ? material.Name : 'Unknown',
          PlannedMetrics: plannedMetrics,
          ActualProductionRecords: task.ActualProductionRecords.map((record, index) => ({
            ...record,
            Material: material ? material.Name : 'Unknown',
            ActualMetrics: actualMetrics[index],
          })),
          CurrentStatus: task.CurrentStatus,
          IsComplete: task.CurrentStatus === 'finished',
          PrimaryResource: task.PrimaryResource,
          SupportingResources: task.SupportingResources,
        };
      });
    });
  } catch (error) {
    console.error('Error fetching details:', error);
    throw error;
  }
};

app.get('/', (req, res) => {
  res.send('Welcome to the Task Manager API!');
});

app.get('/api/shifts', async (req, res) => {
  try {
    const { StartDate, EndDate } = req.query;
    console.log('Making request to third-party API with parameters:', { StartDate, EndDate });
    const response = await axios.get(`${config.SHIFT_URL}`, {
      params: { StartDate, EndDate },
      headers: {
        Accept: 'application/json',
        ApiToken: config.API_TOKEN,
      },
      httpsAgent: httpsAgent,
    });
    console.log('Response received from third-party API:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.data });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from the server' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const { StartDate, EndDate } = req.query;
    console.log('Making request to third-party API with parameters:', { StartDate, EndDate });
    const response = await axios.get(`${config.API_URL}/ShiftWorkItems`, {
      params: { StartDate, EndDate },
      headers: {
        Accept: 'application/json',
        ApiToken: config.API_TOKEN,
      },
      httpsAgent: httpsAgent,
    });
    console.log('Response received from third-party API:', response.data);

    // Enhance the task data
    const enhancedData = await enhanceTaskData(response.data.WorkItems);

    res.json({ WorkItems: enhancedData });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.data });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from the server' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/tasks/finish', async (req, res) => {
  try {
    const response = await axios.post(`${config.API_URL}/FinishWorkItem`, req.body, {
      headers: {
        Accept: 'application/json',
        ApiToken: config.API_TOKEN,
        'Content-Type': 'application/json',
      },
      httpsAgent: httpsAgent,
    });
    console.log('Response received from third-party API:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error finishing task:', error);
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.data });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from the server' });
    } else {
      res.status(500).json({ error: error.message });    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});