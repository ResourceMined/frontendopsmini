// Fetch tasks based on the provided date range and shift
async function loadTasksForShiftRange(startDate, endDate, startShift, endShift) {
  const roundToSigFigs = (num, sigFigs = 2) => {
      if (num === 0) return 0; // Handle zero case

      const magnitude = Math.floor(Math.log10(Math.abs(num)) + 1);
      const multiplier = 10 ** (sigFigs - magnitude);
      const rounded = Math.round(num * multiplier) / multiplier;
      return rounded;
  };

  let startDateTime, endDateTime;
  if (startShift === "day") {
      startDateTime = `${startDate}T06:00:00Z`;
  } else {
      startDateTime = `${startDate}T18:00:00Z`;
  }

  if (endShift === "day") {
      endDateTime = `${endDate}T18:00:00Z`;
  } else {
      endDateTime =
          new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0] + "T06:00:00Z";
  }

  const url = `http://localhost:3000/proxy/tasks?StartDate=${encodeURIComponent(
      startDateTime
  )}&EndDate=${encodeURIComponent(endDateTime)}`;

  try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.WorkItems) {
          // Round PlannedQuantity before displaying tasks
          data.WorkItems.forEach(workItem => {
              workItem.PlannedQuantity = roundToSigFigs(workItem.PlannedQuantity, 3); // Round to 3 significant figures
          });

          displayTasks(data.WorkItems);
      } else {
          console.error("No WorkItems found in the response.");
      }
  } catch (error) {
      console.error("Error fetching tasks:", error);
  }
}

// Display tasks grouped by shift and activity type
function displayTasks(workItems) {
  const tasksContainer = document.getElementById("tasks");
  const taskModal = document.getElementById("taskModal");
  tasksContainer.innerHTML = "";
  taskModal.innerHTML = "";
  taskModal.classList.remove("active");

  const groupedByShift = groupBy(workItems, "ShiftId");

  for (const [shiftId, tasks] of Object.entries(groupedByShift)) {
      const shiftElement = document.createElement("div");
      shiftElement.classList.add("shift");
      const shiftName = tasks[0].ShiftName; // Assuming all tasks have the same ShiftName in the group
      shiftElement.innerHTML = `<h2>${shiftName}</h2>`;

      const groupedByActivity = groupBy(tasks, "ActivityType");

      for (const [activityType, activityTasks] of Object.entries(
          groupedByActivity
      )) {
          const activityElement = document.createElement("div");
          activityElement.classList.add("activity");
          activityElement.innerHTML = `<h3>${activityType}</h3>`;

          activityTasks.forEach((task) => {
              const taskElement = document.createElement("div");
              taskElement.classList.add("task");
              taskElement.style.backgroundColor = task.ActivityColor;
              if (task.IsComplete) {
                  taskElement.style.opacity = "1";
              } else {
                  taskElement.style.opacity = "0.5";
              }
              const isDarkColor = isDark(task.ActivityColor);
              taskElement.classList.toggle("black-text", !isDarkColor);
              taskElement.innerHTML = `
                  <span>Task: ${task.ActivityType}</span>
                  <span>Location: ${task.Location}</span>
              `;
              taskElement.addEventListener("click", () => showTaskDetails(task));
              activityElement.appendChild(taskElement);
          });

          shiftElement.appendChild(activityElement);
      }

      tasksContainer.appendChild(shiftElement);
  }
}

// Show detailed information about a specific task
async function showTaskDetails(task) {
  const taskModal = document.getElementById("taskModal");

  try {
      const response = await fetch(`http://localhost:3000/proxy/details?StartDate=${task.StartDateTime}&EndDate=${task.FinishDateTime}`);
      const cachedDetails = await response.json();

      taskModal.innerHTML = `
          <h2>Task Details</h2>
          <form id="taskUpdateForm">
              <input type="hidden" name="taskId" value="${task.Id}">
              <div class="task-summary">
                  <p><strong>Activity Type:</strong> ${task.ActivityType}</p>
                  <p><strong>Location:</strong> ${task.Location}</p>
                  <p><strong>Start DateTime:</strong> ${task.StartDateTime}</p>
                  <p><strong>Finish DateTime:</strong> ${task.FinishDateTime}</p>
                  <button class="expand-details-btn">Expand Details</button>
              </div>
              <div class="task-details" style="display: none;">
                  <p><strong>Planned Quantity:</strong> ${task.PlannedQuantity}</p>
                  <p><strong>Material:</strong> ${task.Material}</p>
                  <p><strong>Planned Metrics:</strong></p>
                  <ul>
                      ${task.PlannedMetrics.map(metric => `<li>${metric.Metric}: ${metric.Value}</li>`).join('')}
                  </ul>
                  <p><strong>Actual Production Records:</strong></p>
                  ${task.ActualProductionRecords.map((record, recordIndex) => `
                      <div>
                          <p><strong>Production Record ID:</strong> ${record.ProductionRecordId}</p>
                          <label><strong>Material ID:</strong></label>
                          <input type="text" name="actualProductionRecords[${recordIndex}].MaterialId" value="${record.MaterialId}">
                          <label><strong>Supporting Resource ID:</strong></label>
                          <input type="text" name="actualProductionRecords[${recordIndex}].SupportingResourceId" value="${record.SupportingResourceId}">
                          <label><strong>Destination ID:</strong></label>
                          <input type="text" name="actualProductionRecords[${recordIndex}].DestinationId" value="${record.DestinationId}">
                          <label><strong>Operator ID:</strong></label>
                          <input type="text" name="actualProductionRecords[${recordIndex}].OperatorId" value="${record.OperatorId}">
                          <label><strong>Source ID:</strong></label>
                          <input type="text" name="actualProductionRecords[${recordIndex}].SourceId" value="${record.SourceId}">
                          <p><strong>Actual Metrics:</strong></p>
                          <ul>
                              ${record.ActualMetrics.map((metric, metricIndex) => `
                                  <li>
                                      <label>Metric:</label>
                                      <select name="actualProductionRecords[${recordIndex}].ActualMetrics[${metricIndex}].MetricId">
                                          ${Array.from(cachedDetails.metrics.values()).map(metricOption => `
                                              <option value="${metricOption.Id}" ${metricOption.Id === metric.MetricId ? 'selected' : ''}>
                                                  ${metricOption.Name}
                                              </option>
                                          `).join('')}
                                      </select>
                                      <label>Value:</label>
                                      <input type="number" name="actualProductionRecords[${recordIndex}].ActualMetrics[${metricIndex}].Value" value="${metric.Value}">
                                  </li>
                              `).join('')}
                          </ul>
                          <input type="hidden" name="actualProductionRecords[${recordIndex}].RecordedDateTime" value="${record.RecordedDateTime}">
                      </div>
                  `).join('')}
                  <label><strong>Activity Status:</strong></label>
                  <select name="activityStatus">
                      <option value="notstarted" ${task.CurrentStatus === 'notstarted' ? 'selected' : ''}>Not Started</option>
                      <option value="inprogress" ${task.CurrentStatus === 'inprogress' ? 'selected' : ''}>In Progress</option>
                      <option value="finished" ${task.CurrentStatus === 'finished' ? 'selected' : ''}>Finished</option>
                  </select>
                  <button type="submit">Update Task</button>
              </div>
          </form>
      `;

      // Add click event listener to the expand button
      const expandButton = taskModal.querySelector(".expand-details-btn");
      expandButton.addEventListener("click", () => {
          const detailsSection = taskModal.querySelector(".task-details");
          if (detailsSection.style.display === "none") {
              detailsSection.style.display = "block";
              expandButton.textContent = "Collapse Details";
          } else {
              detailsSection.style.display = "none";
              expandButton.textContent = "Expand Details";
          }
      });

      taskModal.classList.add("active");

      // Form submission handler
      const taskUpdateForm = document.getElementById("taskUpdateForm");
      taskUpdateForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(taskUpdateForm);
          const taskId = formData.get("taskId");

          // Construct the request payload
          const updateDetails = {
              ActivityRecordId: taskId,
              ActivityRecordExternalId: task.ExternalId || null,
              ActivityDistributionIndex: 0, // Set appropriate value
              ActualProductionRecords: []
          };

          for (let i = 0; i < task.ActualProductionRecords.length; i++) {
              const record = {
                  ProductionRecordId: formData.get(`actualProductionRecords[${i}].ProductionRecordId`),
                  MaterialId: formData.get(`actualProductionRecords[${i}].MaterialId`),
                  SupportingResourceId: formData.get(`actualProductionRecords[${i}].SupportingResourceId`),
                  DestinationId: formData.get(`actualProductionRecords[${i}].DestinationId`),
                  OperatorId: formData.get(`actualProductionRecords[${i}].OperatorId`),
                  SourceId: formData.get(`actualProductionRecords[${i}].SourceId`),
                  RecordedDateTime: formData.get(`actualProductionRecords[${i}].RecordedDateTime`),
                  ActualMetrics: []
              };

              for (let j = 0; j < task.ActualProductionRecords[i].ActualMetrics.length; j++) {
                  record.ActualMetrics.push({
                      MetricId: formData.get(`actualProductionRecords[${i}].ActualMetrics[${j}].MetricId`),
                      Value: formData.get(`actualProductionRecords[${i}].ActualMetrics[${j}].Value`)
                  });
              }

              updateDetails.ActualProductionRecords.push(record);
          }

          const activityStatus = formData.get("activityStatus");

          try {
              const response = await fetch(`/proxy/updateTask?taskId=${taskId}`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      Details: [updateDetails],
                      CurrentStatus: activityStatus
                  })
              });

              if (!response.ok) {
                  throw new Error('Network response was not ok.');
              }

              const responseData = await response.json();
              console.log('Task updated:', responseData);
              // Update the UI or show a success message
          } catch (error) {
              console.error('There has been a problem with your fetch operation:', error);
              // Handle errors appropriately (e.g., show error message)
          }
      });
  } catch (error) {
      console.error("Error fetching details:", error);
  }
}

// Helper function to group array items by key
function groupBy(array, key) {
  return array.reduce((result, currentValue) => {
      (result[currentValue[key]] = result[currentValue[key]] || []).push(
          currentValue
      );
      return result;
  }, {});
}

// Helper function to determine if a color is dark
function isDark(color) {
  const rgb = color.replace(/[^\d,]/g, "").split(",");
  const r = parseInt(rgb[0]);
  const g = parseInt(rgb[1]);
  const b = parseInt(rgb[2]);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

// Load tasks for different time ranges
function loadTasksForToday() {
  const today = new Date().toISOString().split("T")[0];
  loadTasksForShiftRange(today, today, "day", "day");
}

function loadTasksForYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  loadTasksForShiftRange(yesterdayStr, yesterdayStr, "day", "day");
}

function loadTasksForLast24Hours() {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
  const end = now.toISOString().slice(0, 16);
  loadTasksForShiftRange(start, end, "day", "day");
}

function toggleCustomRange() {
  const customRange = document.getElementById("customRange");
  customRange.style.display =
      customRange.style.display === "none" ? "flex" : "none";
}

function loadTasksForCustomRange() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const startShift = document.getElementById("startShift").value;
  const endShift = document.getElementById("endShift").value;
  if (startDate && endDate) {
      loadTasksForShiftRange(startDate, endDate, startShift, endShift);
  } else {
      alert("Please select both start and end dates");
  }
}
