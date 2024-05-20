let currentDate = new Date();
console.log("Current date:", currentDate);

function convertToDarwinTime(date) {
  const darwinOffset = 0; // 9.5 hours in milliseconds
  return new Date(date.getTime() + darwinOffset);
}

async function loadShifts() {
  const startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const endDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  try {
    const response = await fetch(`http://localhost:3000/api/shifts?StartDate=${startDate}&EndDate=${endDate}`);
    const data = await response.json();
    if (data.Shifts) {
      displayShiftButtons(data.Shifts);
    } else {
      console.error("Error fetching shifts:", data);
      alert(`Error: ${data.message}`);
    }
  } catch (error) {
    console.error("Error fetching shifts:", error);
  }
}

let selectedShiftButton = null;

function displayShiftButtons(shifts) {
  const shiftWheel = document.getElementById("shiftWheel");
  shiftWheel.innerHTML = "";

  // Sort shifts with NS before DS for the same date
  shifts.sort((a, b) => {
    if (a.ShiftDate === b.ShiftDate) {
      return a.ShiftCode === "NS" ? -1 : 1;
    }
    return new Date(b.ShiftDate) - new Date(a.ShiftDate);
  });

  shifts.forEach((shift) => {
    const button = document.createElement("button");
    const shiftDate = new Date(`${shift.ShiftDate}T07:00:00Z`);
    const darwinDate = convertToDarwinTime(shiftDate);

    const formattedDate = darwinDate.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
    button.textContent = `${formattedDate} - ${shift.ShiftCode}`;

    button.addEventListener("click", () => {
      if (selectedShiftButton) {
        selectedShiftButton.classList.remove("selected");
      }
      selectedShiftButton = button;
      button.classList.add("selected");
      loadTasksForShift(shift);
    });

    if (shift.ShiftDate === currentDate.toISOString().split("T")[0]) {
      button.classList.add("today");
    }

    shiftWheel.appendChild(button);
  });
}

async function loadTasksForShift(shift) {
  currentShift = shift;

  let startDate = new Date(`${shift.ShiftDate}T${shift.ShiftStartTime}:00Z`);
  let endDate;

  if (shift.ShiftCode === "NS") {
    // Night Shift: End date should be the next day at 07:00
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setUTCHours(7, 0, 0, 0); // Set end time to 07:00:00.000
  } else {
    // Day Shift: End date is 12 hours after start date
    endDate = new Date(startDate.getTime() + 12 * 60 * 60 * 1000);
  }

  startDate = startDate.toISOString();
  endDate = endDate.toISOString();

  console.log("Start Date:", startDate);
  console.log("End Date:", endDate);
  console.log("Shift:", shift);
  console.log("Current Shift:", currentShift);

  try {
    const response = await fetch(`http://localhost:3000/api/tasks?StartDate=${startDate}&EndDate=${endDate}`);
    const data = await response.json();
    if (data.WorkItems) {
      displayTasks(data.WorkItems);
    } else {
      console.error("Error fetching tasks:", data);
      alert(`Error: ${data.message}`);
    }
  } catch (error) {
    console.error("Error fetching tasks:", error);
  }
}

function displayTasks(workItems) {
  const tasksContainer = document.getElementById("tasks");
  const taskModal = document.getElementById("taskModal");
  tasksContainer.innerHTML = "";
  taskModal.innerHTML = "";
  taskModal.classList.remove("active");

  const groupedByActivity = groupBy(workItems, "ActivityType");

  for (const [activityType, activityTasks] of Object.entries(groupedByActivity)) {
    const activityElement = document.createElement("div");
    activityElement.classList.add("activity");
    activityElement.innerHTML = `<h3>${activityType}</h3>`;

    activityTasks.forEach((task) => {
      const taskElement = document.createElement("div");
      taskElement.classList.add("task");
      taskElement.style.backgroundColor = task.ActivityColor;
      if (task.IsComplete) {
        taskElement.style.opacity = '1';
      } else {
        taskElement.style.opacity = '0.5';
      }
      const isDarkColor = isDark(task.ActivityColor);
      taskElement.classList.toggle('black-text', !isDarkColor);
      taskElement.innerHTML = `
        <span>Task: ${task.ActivityType}</span>
        <span>Location: ${task.Location}</span>
      `;
      taskElement.addEventListener("click", () => showTaskDetails(task));
      activityElement.appendChild(taskElement);
    });

    tasksContainer.appendChild(activityElement);
  }
}

function showTaskDetails(task) {
  const taskModal = document.getElementById("taskModal");
  taskModal.innerHTML = `
    <h2>Task Details</h2>
    <p><strong>Activity Type:</strong> ${task.ActivityType}</p>
    <p><strong>Location:</strong> ${task.Location}</p>
    <p><strong>Start DateTime:</strong> ${task.StartDateTime}</p>
    <p><strong>Finish DateTime:</strong> ${task.FinishDateTime}</p>
    <p><strong>Planned Quantity:</strong> ${task.PlannedQuantity}</p>
    <p><strong>Material:</strong> ${task.Material}</p>
    <p><strong>Planned Metrics:</strong></p>
    <ul>
      ${task.PlannedMetrics.map(
        (metric) => `<li>${metric.Metric}: ${metric.Value}</li>`
      ).join("")}
    </ul>
    <div id="actualMetrics"></div>
    <button id="finishTaskBtn">Finish Task</button>
  `;

  const actualMetricsContainer = document.getElementById("actualMetrics");
  actualMetricsContainer.innerHTML = `
    <h3>Actual Metrics:</h3>
    ${task.PlannedMetrics.map(
      (metric) => `
      <div>
        <label>${metric.Metric}:</label>
        <input type="number" id="actual-${metric.MetricId}" value="${metric.Value}">
      </div>
    `
    ).join("")}
  `;

  const finishTaskBtn = document.getElementById("finishTaskBtn");
  finishTaskBtn.addEventListener("click", () => finishTask(task));

  taskModal.classList.add("active");
}

async function finishTask(task) {
  const actualMetrics = task.PlannedMetrics.map((metric) => {
    const actualValue = document.getElementById(
      `actual-${metric.MetricId}`
    ).value;
    return {
      MetricId: metric.MetricId,
      Value: actualValue,
    };
  });

  const data = {
    ActivityRecordId: task.ActivityRecordId,
    ActivityDistributionIndex: task.ActivityDistributionIndex,
    ActualStartDateTime: task.StartDateTime,
    ActualFinishDateTime: task.FinishDateTime,
    ActivityIsComplete: true,
    OverrideRemainingQuantity: null,
    ActualProductionRecords: [
      {
        ProductionRecordId:
          task.ActualProductionRecords[0]?.ProductionRecordId || "",
        ExternalId: null,
        MaterialId: task.PlannedMaterialId || "",
        DestinationId: task.PlannedDestinationId || "",
        OperatorId: task.PrimaryResource?.ResourceId || "",
        SourceId: task.PlannedSourceId || "",
        ActualMetrics: actualMetrics,
        RecordedDateTime: new Date().toISOString(),
      },
    ],
    PercentComplete: 100,
    ExternalId: `ABC-${Math.floor(Math.random() * 100000000)}`,
  };

  try {
    const response = await fetch("http://localhost:3000/api/tasks/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const responseData = await response.json();
    console.log("Task finished:", responseData);
    task.CurrentStatus = "finished";
    loadTasksForShift(currentShift); // Reload tasks for the current shift
  } catch (error) {
    console.error("Error finishing task:", error);
    alert("An error occurred while finishing the task.");
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
  if (!color) {
    return false; // Return false if color is undefined or falsy
  }
  const rgb = color.replace(/[^\d,]/g, "").split(",");
  const r = parseInt(rgb[0]);
  const g = parseInt(rgb[1]);
  const b = parseInt(rgb[2]);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

// Load shifts when the page loads
window.addEventListener("DOMContentLoaded", loadShifts);