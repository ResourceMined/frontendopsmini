import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export const fetchData = async (url, params) => {
  try {
    const response = await axios.get(url, {
      params,
      headers: {
        Accept: 'application/json',
        ApiToken: config.API_TOKEN,
      },
      httpsAgent: httpsAgent,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

export const handleError = (res, error) => {
  console.error('Error:', error);
  if (error.response) {
    res.status(error.response.status).json({
      message: 'An error occurred.',
      error: error.response.data,
    });
  } else if (error.request) {
    res.status(500).json({
      message: 'No response received from the server.',
      error: error.message,
    });
  } else {
    res.status(500).json({
      message: 'An error occurred while setting up the request.',
      error: error.message,
    });
  }
};