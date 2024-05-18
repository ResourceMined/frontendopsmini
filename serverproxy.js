const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');
require('dotenv').config();

const app = express();

const API_URL = process.env.API_URL || 'https://opstanamitest.newmont.com/api/external/v3.7/ShiftWorkItems';
const API_TOKEN = process.env.API_TOKEN;
const ACTIVITY_DEFINITION_URL = process.env.ACTIVITY_DEFINITION_URL;
const WORKPLACE_URL = process.env.WORKPLACE_URL;
const MATERIAL_URL = process.env.MATERIAL_URL;
const METRIC_URL = process.env.METRIC_URL;
const SHIFT_URL = process.env.SHIFT_URL || 'https://opstanamitest.newmont.com/api/external/v3.7/Shifts';

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Create an https agent to ignore SSL certificate
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Function to fetch data from an API
const fetchData = async (url, token, params) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'ApiToken': token
            },
            params,
            httpsAgent: agent
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
};

// Fetch and cache all necessary details concurrently
const fetchAllDetails = async (startDate, endDate) => {
    try {
        const [activityDefinitionsData, workplacesData, materialsData, metricsData, shiftsData] = await Promise.all([
            fetchData(ACTIVITY_DEFINITION_URL, API_TOKEN),
            fetchData(WORKPLACE_URL, API_TOKEN),
            fetchData(MATERIAL_URL, API_TOKEN),
            fetchData(METRIC_URL, API_TOKEN),
            fetchData(SHIFT_URL, API_TOKEN, { StartDate: startDate, EndDate: endDate })
        ]);

        return {
            activityDefinitions: new Map(activityDefinitionsData.ActivityDefinitions.map(ad => [ad.Id, ad])),
            workplaces: new Map(workplacesData.Locations.map(wp => [wp.Id, wp])),
            materials: new Map(materialsData.Materials.map(mat => [mat.Id, mat])),
            metrics: new Map(metricsData.Metrics.map(met => [met.Id, met])),
            shifts: new Map(shiftsData.Shifts.map(shift => [shift.Id, shift]))
        };
    } catch (error) {
        console.error('Error fetching details:', error);
        throw error;
    }
};

// Enhance task data with readable information
const enhanceTaskData = async (tasks, startDate, endDate) => {
  try {
    const { activityDefinitions, workplaces, materials, metrics, shifts } = await fetchAllDetails(startDate, endDate);

    return tasks.flatMap(task => {
      const activityDefinition = activityDefinitions.get(task.ActivityDefinitionId);
      const workplace = workplaces.get(task.WorkplaceId);
      const material = materials.get(task.PlannedMaterialId);

      const plannedMetrics = task.PlannedMetrics.map(metric => {
        const metricInfo = metrics.get(metric.MetricId);
        return {
          Metric: metricInfo ? metricInfo.Name : 'Unknown',
          Value: metric.Value
        };
      });

      const actualMetrics = task.ActualProductionRecords.map(record => {
        return record.ActualMetrics.map(metric => {
          const metricInfo = metrics.get(metric.MetricId);
          return {
            Metric: metricInfo ? metricInfo.Name : 'Unknown',
            Value: metric.Value
          };
        });
      });

      // Create task entries for each shift
      return task.ShiftIds.map(shiftId => {
        const shift = shifts.get(shiftId);
        return {
          Id: task.Id,
          ActivityRecordId: task.ActivityRecordId, // Include the ActivityRecordId
          ActivityDistributionIndex: task.ActivityDistributionIndex, // Include the ActivityDistributionIndex
          ShiftId: shiftId,
          ShiftName: shift ? `${shift.ShiftDate}: ${shift.ShiftName}` : 'Unknown',
          ActivityType: activityDefinition ? activityDefinition.Name : 'Unknown',
          ActivityColor: activityDefinition ? activityDefinition.Color : '#000000',
          Location: workplace ? workplace.Name : 'Unknown',
          StartDateTime: task.StartDateTime,
          FinishDateTime: task.FinishDateTime,
          PlannedQuantity: task.PlannedQuantity,
          Material: material ? material.Name : 'Unknown',
          PlannedMetrics: plannedMetrics,
          ActualProductionRecords: task.ActualProductionRecords.map((record, index) => ({
            ...record,
            Material: material ? material.Name : 'Unknown',
            ActualMetrics: actualMetrics[index]
          })),
          CurrentStatus: task.CurrentStatus,
          IsComplete: task.CurrentStatus === 'finished',
          PrimaryResource: task.PrimaryResource,
          SupportingResources: task.SupportingResources
        };
      });
    });
  } catch (error) {
    console.error('Error enhancing task data:', error);
    throw error;
  }
};

// Endpoint for fetching tasks
app.get('/proxy/tasks', async (req, res) => {
  try {
    const { StartDate, EndDate } = req.query;
    if (!StartDate || !EndDate) {
      return res.status(400).json({ message: 'StartDate and EndDate are required.' });
    }

    const data = await fetchData(API_URL, API_TOKEN, { StartDate, EndDate });
    const enhancedData = await enhanceTaskData(data.WorkItems, StartDate, EndDate);
    res.json({ WorkItems: enhancedData });
  } catch (error) {
    handleError(res, error);
  }
});

// Error handling function
const handleError = (res, error) => {
    console.error('Error fetching data:', error);
    const errorResponse = {
        message: 'An error occurred',
        error: {
            message: error.message,
            ...(error.response && {
                response: {
                    data: error.response.data,
                    status: error.response.status,
                    headers: error.response.headers
                }
            }),
            ...(error.request && { request: 'Request made but no response received' })
        }
    };
    res.status(error.response ? error.response.status : 500).json(errorResponse);
};

// Endpoint for updating tasks
app.post('/proxy/updateTask', async (req, res) => {
    try {
        const taskId = req.query.taskId;
        console.log("Received Task ID: ", taskId); // Log the received taskId
        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        const { Details, CurrentStatus } = req.body;
        console.log("Received Details: ", JSON.stringify(Details, null, 2)); // Log the received Details

        // Ensure ActualProductionRecords is not empty
        if (!Details[0].ActualProductionRecords || Details[0].ActualProductionRecords.length === 0) {
            return res.status(400).json({ error: 'ActualProductionRecords must contain at least one record' });
        }

        const updateData = {
            Details: [
                {
                    ActivityRecordId: taskId,
                    ActivityRecordExternalId: Details[0].ActivityRecordExternalId,
                    ActivityDistributionIndex: Details[0].ActivityDistributionIndex,
                    ActualProductionRecords: Details[0].ActualProductionRecords
                }
            ],
            CurrentStatus: CurrentStatus
        };

        const response = await axios.post(
            'https://opstanamitest.newmont.com/api/external/v3.7/UpdateWorkitemActualProductionRecords',
            updateData,
            {
                headers: {
                    'Accept': 'application/json',
                    'ApiToken': API_TOKEN,
                    'Content-Type': 'application/json'
                },
                httpsAgent: agent // Use the httpsAgent to ignore SSL errors
            }
        );
        res.json(response.data); // Return the API response to the frontend
    } catch (error) {
        console.error('Error during task update:', error.response ? error.response.data : error.message);
        handleError(res, error);
    }
});

app.post('/proxy/startTask', async (req, res) => {
  try {
    const data = req.body;
    const response = await axios.post(
      'https://opstanamitest.newmont.com/api/external/v3.7/StartWorkItem',
      data,
      {
        headers: {
          'Accept': 'application/json',
          'ApiToken': API_TOKEN,
          'Content-Type': 'application/json'
        },
        httpsAgent: agent
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error during task start:', error.response ? error.response.data : error.message);
    handleError(res, error);
  }
});

app.post('/proxy/finishTask', async (req, res) => {
  try {
    const data = req.body;
    const response = await axios.post(
      'https://opstanamitest.newmont.com/api/external/v3.7/FinishWorkItem',
      data,
      {
        headers: {
          'Accept': 'application/json',
          'ApiToken': API_TOKEN,
          'Content-Type': 'application/json'
        },
        httpsAgent: agent
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error during task finish:', error.response ? error.response.data : error.message);
    handleError(res, error);
  }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
