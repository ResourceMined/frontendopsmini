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

// Create an https agent to ignore SSL certificate
const agent = new https.Agent({
  rejectUnauthorized: false
});

// Function to fetch data from an API
const fetchData = async (url, token, params) => {
  const response = await axios.get(url, {
    headers: {
      'Accept': 'application/json',
      'ApiToken': token
    },
    params,
    httpsAgent: agent
  });
  return response.data;
};

// Fetch and cache all necessary details concurrently
const fetchAllDetails = async (startDate, endDate) => {
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
};

// Enhance task data with readable information
const enhanceTaskData = async (tasks, startDate, endDate) => {
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
  if (error.response) {
    console.error('Response data:', error.response.data);
    console.error('Response status:', error.response.status);
    console.error('Response headers:', error.response.headers);
    res.status(error.response.status).json({
      message: 'Error in response from API',
      data: error.response.data
    });
  } else if (error.request) {
    console.error('Request data:', error.request);
    res.status(500).json({
      message: 'No response received from API',
      request: error.request
    });
  } else {
    console.error('Error message:', error.message);
    res.status(500).json({
      message: 'Error in setting up API request',
      error: error.message
    });
  }
};

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
