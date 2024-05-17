const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');
const app = express();

const API_URL = 'https://opstanamitest.newmont.com/api/external/v3.7/ShiftWorkItems';
const API_TOKEN = 'D44FEDABD0234A63BA48860CBB527B5B';

// Use CORS middleware
app.use(cors());

// Create an https agent to ignore SSL certificate
const agent = new https.Agent({
  rejectUnauthorized: false
});

app.get('/proxy/tasks', async (req, res) => {
  try {
    const { StartDate, EndDate } = req.query;
    const response = await axios.get(API_URL, {
      headers: {
        'Accept': 'application/json',
        'ApiToken': API_TOKEN
      },
      params: {
        StartDate,
        EndDate
      },
      httpsAgent: agent
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      res.status(error.response.status).send(error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Request data:', error.request);
      res.status(500).send('No response received from API');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
      res.status(500).send('Error in setting up API request');
    }
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
