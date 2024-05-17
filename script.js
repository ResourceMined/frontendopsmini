function loadTasks() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const startShift = document.getElementById('startShift').value;
    const endShift = document.getElementById('endShift').value;
    if (startDate && endDate) {
      loadTasksForShiftRange(startDate, endDate, startShift, endShift);
    } else {
      alert('Please select both start and end dates');
    }
  }
  
  function loadTasksForToday() {
    const today = new Date().toISOString().split('T')[0];
    loadTasksForShiftRange(today, today, 'day', 'day');
  }
  
  function loadTasksForYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    loadTasksForShiftRange(yesterdayStr, yesterdayStr, 'day', 'day');
  }
  
  function loadTasksForLast24Hours() {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const end = now.toISOString().slice(0, 16);
    loadTasksForShiftRange(start, end, 'day', 'day');
  }
  
  function toggleCustomRange() {
    const customRange = document.getElementById('customRange');
    customRange.style.display = customRange.style.display === 'none' ? 'flex' : 'none';
  }
  
  function loadTasksForCustomRange() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const startShift = document.getElementById('startShift').value;
    const endShift = document.getElementById('endShift').value;
    if (startDate && endDate) {
      loadTasksForShiftRange(startDate, endDate, startShift, endShift);
    } else {
      alert('Please select both start and end dates');
    }
  }
  
  function loadTasksForShiftRange(startDate, endDate, startShift, endShift) {
    let startDateTime, endDateTime;
    if (startShift === 'day') {
      startDateTime = `${startDate}T06:00:00Z`;
    } else {
      startDateTime = `${startDate}T18:00:00Z`;
    }
  
    if (endShift === 'day') {
      endDateTime = `${endDate}T18:00:00Z`;
    } else {
      endDateTime = new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T06:00:00Z';
    }
  
    const url = `http://localhost:3000/proxy/tasks?StartDate=${encodeURIComponent(startDateTime)}&EndDate=${encodeURIComponent(endDateTime)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.WorkItems) {
          displayTasks(data.WorkItems);
        } else {
          console.error('Error fetching tasks:', data);
          alert(`Error: ${data.message}`);
        }
      })
      .catch(error => console.error('Error fetching tasks:', error));
  }
  
  function displayTasks(workItems) {
    const tasksContainer = document.getElementById('tasks');
    const taskModal = document.getElementById('taskModal');
    tasksContainer.innerHTML = '';
    taskModal.innerHTML = '';
    taskModal.classList.remove('active');
    
    const groupedByShift = groupBy(workItems, 'ShiftId');
  
    for (const [shiftId, tasks] of Object.entries(groupedByShift)) {
      const shiftElement = document.createElement('div');
      shiftElement.classList.add('shift');
      const shiftName = tasks[0].ShiftName; // Assuming all tasks have the same ShiftName in the group
      shiftElement.innerHTML = `<h2>${shiftName}</h2>`;
  
      const groupedByActivity = groupBy(tasks, 'ActivityType');
      
      for (const [activityType, activityTasks] of Object.entries(groupedByActivity)) {
        const activityElement = document.createElement('div');
        activityElement.classList.add('activity');
        activityElement.innerHTML = `<h3>${activityType}</h3>`;
        
        activityTasks.forEach(task => {
          const taskElement = document.createElement('div');
          taskElement.classList.add('task');
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
          taskElement.addEventListener('click', () => showTaskDetails(task));
          activityElement.appendChild(taskElement);
        });
  
        shiftElement.appendChild(activityElement);
      }
  
      tasksContainer.appendChild(shiftElement);
    }
  }
  
  function showTaskDetails(task) {
    const taskModal = document.getElementById('taskModal');
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
        ${task.PlannedMetrics.map(metric => `<li>${metric.Metric}: ${metric.Value}</li>`).join('')}
      </ul>
      <p><strong>Actual Production Records:</strong></p>
      ${task.ActualProductionRecords.map(record => `
        <div>
          <p><strong>Production Record ID:</strong> ${record.ProductionRecordId}</p>
          <p><strong>Material:</strong> ${record.Material}</p>
          <ul>
            ${record.ActualMetrics.map(metric => `<li>${metric.Metric}: ${metric.Value}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
      <p><strong>Current Status:</strong> ${task.CurrentStatus}</p>
      <p><strong>Primary Resource:</strong> ${task.PrimaryResource}</p>
      <p><strong>Supporting Resources:</strong> ${task.SupportingResources}</p>
    `;
    taskModal.classList.add('active');
  }
  
  // Helper function to group array items by key
  function groupBy(array, key) {
    return array.reduce((result, currentValue) => {
      (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
      return result;
    }, {});
  }
  
  // Helper function to determine if a color is dark
  function isDark(color) {
    const rgb = color.replace(/[^\d,]/g, '').split(',');
    const r = parseInt(rgb[0]);
    const g = parseInt(rgb[1]);
    const b = parseInt(rgb[2]);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  