/* eslint-disable */
import API_BASE from '../../utils/url';
import axios from 'axios';

import { showAlert } from './alerts';

export const login = async (email, password) => {
  try {
    const res = await axios({
      method: 'POST',
      url: `${API_BASE}/api/v1/users/login`,
      data: { email, password },
    });

    if (res.data.status === 'success') {
      showAlert('success', 'Logged in successfully');
      setTimeout(() => location.assign('/'), 1500);
    }
  } catch (err) {
    showAlert('error', 'Login failed');
    console.error(err);
  }
};

export const logout = async () => {
  try {
    const res = await axios({
      url: `${API_BASE}/api/v1/users/logout`,
    });

    if (res.data.status === 'success') window.location.reload(true); // 'true' force reload from the server, not cache (legacy)
  } catch (err) {
    console.log(err.response);
    showAlert('error', 'Error logging out! Try again.');
  }
};
