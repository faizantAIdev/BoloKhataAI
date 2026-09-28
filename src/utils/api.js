import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://voicekhataai.onrender.com';

const apiFetch = async (endpoint, options = {}) => {
  try {
    const token = await AsyncStorage.getItem('authToken');

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      `${API_URL}${endpoint}`,
      {
        ...options,
        headers,
      }
    );

    const data = await response.json();

    // JWT expired / invalid
    if (response.status === 401) {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userId');
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
    };

  } catch (error) {
    console.error('API Error:', error);

    throw error;
  }
};

export default apiFetch;