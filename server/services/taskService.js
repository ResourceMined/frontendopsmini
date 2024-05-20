import * as apiUtils from '../utils/apiUtils.js';
import * as dateUtils from '../utils/dateUtils.js';
import config from '../config/config.js';

export const getTasks = async (req, res) => {
  try {
    const { StartDate, EndDate, ShiftId } = req.query;
    if (!StartDate || !EndDate) {
      return res.status(400).json({ message: "StartDate and EndDate are required." });
    }

    const data = await apiUtils.fetchData(config.API_URL, config.API_TOKEN, { StartDate, EndDate });
    const enhancedData = await enhanceTaskData(data.WorkItems, ShiftId);
    res.json({ WorkItems: enhancedData });
  } catch (error) {
    apiUtils.handleError(res, error);
  }
};

export const updateTask = async (req, res) => {
  try {
    const taskId = req.query.taskId;
    console.log("Received Task ID: ", taskId);
    if (!taskId) {
      return res.status(400).json({ error: "Task ID is required" });
    }

    const { Details, CurrentStatus } = req.body;
    console.log("Received Details: ", JSON.stringify(Details, null, 2));

    if (!Details[0].ActualProductionRecords || Details[0].ActualProductionRecords.length === 0) {
      return res.status(400).json({ error: "ActualProductionRecords must contain at least one record" });
    }

    const updateData = {
      Details: [
        {
          ActivityRecordId: taskId,
          ActivityRecordExternalId: Details[0].ActivityRecordExternalId,
          ActivityDistributionIndex: Details[0].ActivityDistributionIndex,
          ActualProductionRecords: Details[0].ActualProductionRecords,
        },
      ],
      CurrentStatus: CurrentStatus,
    };

    const response = await apiUtils.postData(
      "https://opstanamitest.newmont.com/api/external/v3.7/UpdateWorkitemActualProductionRecords",
      config.API_TOKEN,
      updateData
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error during task update:", error.response ? error.response.data : error.message);
    apiUtils.handleError(res, error);
  }
};

export const startTask = async (req, res) => {
  try {
    const data = req.body;
    const response = await apiUtils.postData(
      "https://opstanamitest.newmont.com/api/external/v3.7/StartWorkItem",
      config.API_TOKEN,
      data
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error during task start:", error.response ? error.response.data : error.message);
    apiUtils.handleError(res, error);
  }
};

export const finishTask = async (req, res) => {
  try {
    const data = req.body;
    const response = await apiUtils.postData(
      "https://opstanamitest.newmont.com/api/external/v3.7/FinishWorkItem",
      config.API_TOKEN,
      data
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error during task finish:", error.response ? error.response.data : error.message);
    apiUtils.handleError(res, error);
  }
};

const enhanceTaskData = async (tasks, shiftId) => {
  try {
    const { activityDefinitions, workplaces, materials, metrics, shifts } = await fetchAllDetails(shiftId);

    return tasks.flatMap(task => {
      const activityDefinition = activityDefinitions.get(task.ActivityDefinitionId);
      const workplace = workplaces.get(task.WorkplaceId);
      const material = materials.get(task.PlannedMaterialId);

      const plannedMetrics = task.PlannedMetrics.map(metric => {
        const metricInfo = metrics.get(metric.MetricId);
        return {
          MetricId: metric.MetricId,
          Metric: metricInfo ? metricInfo.Name : "Unknown",
          Value: metric.Value,
        };
      });

      const actualMetrics = task.ActualProductionRecords.map(record => {
        return record.ActualMetrics.map(metric => {
          const metricInfo = metrics.get(metric.MetricId);
          return {
            MetricId: metric.MetricId,
            Metric: metricInfo ? metricInfo.Name : "Unknown",
            Value: metric.Value,
          };
        });
      });

      return task.ShiftIds.map(taskShiftId => {
        const shift = shifts.get(taskShiftId);

        let startDateTime = "Unknown";
        let endDateTime = "Unknown";

        if (shift) {
          const shiftStartDate = new Date(`${shift.ShiftDate}T${shift.ShiftStartTime}:00Z`);
          const shiftEndDate = new Date(shiftStartDate.getTime() + 12 * 60 * 60 * 1000); // Add 12 hours for end date

          startDateTime = dateUtils.convertToDarwinTime(shiftStartDate).toISOString();
          endDateTime = dateUtils.convertToDarwinTime(shiftEndDate).toISOString();
        }

        return {
          Id: task.Id,
          ActivityRecordId: task.ActivityRecordId,
          ActivityDistributionIndex: task.ActivityDistributionIndex,
          ShiftId: taskShiftId,
          ShiftName: shift ? `${shift.ShiftDate}: ${shift.ShiftName}` : "Unknown",
          ActivityType: activityDefinition ? activityDefinition.Name : "Unknown",
          ActivityColor: activityDefinition ? activityDefinition.Color : "#000000",
          Location: workplace ? workplace.Name : "Unknown",
          StartDateTime: startDateTime,
          FinishDateTime: endDateTime,
          PlannedQuantity: task.PlannedQuantity,
          Material: material ? material.Name : "Unknown",
          PlannedMetrics: plannedMetrics,
          ActualProductionRecords: task.ActualProductionRecords.map((record, index) => ({
            ...record,
            Material: material ? material.Name : "Unknown",
            ActualMetrics: actualMetrics[index],
          })),
          CurrentStatus: task.CurrentStatus,
          IsComplete: task.CurrentStatus === "finished",
          PrimaryResource: task.PrimaryResource,
          SupportingResources: task.SupportingResources,
        };
      });
    });
  } catch (error) {
    console.error("Error enhancing task data:", error);
    throw error;
  }
};

const fetchAllDetails = async (startDate, endDate) => {
  try {
    const [
      activityDefinitionsData,
      workplacesData,
      materialsData,
      metricsData,
      shiftsData,
    ] = await Promise.all([
      apiUtils.fetchData(config.ACTIVITY_DEFINITION_URL, config.API_TOKEN),
      apiUtils.fetchData(config.WORKPLACE_URL, config.API_TOKEN),
      apiUtils.fetchData(config.MATERIAL_URL, config.API_TOKEN),
      apiUtils.fetchData(config.METRIC_URL, config.API_TOKEN),
      apiUtils.fetchData(config.SHIFT_URL, config.API_TOKEN, {
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
    console.error("Error fetching details:", error);
    throw error;
  }
};