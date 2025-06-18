import axios from 'axios'
const ARI_USER = 'hey'
const ARI_PASS = 'yolo'
const ARI_API_KEY = `api_key=${ARI_USER}:${ARI_PASS}`

const ARI_URL = 'https://asterisk.portal-saras.com/ari'

export async function getAsteriskUserList() {
  const result = await axios.get(`${ARI_URL}/endpoints/PJSIP?${ARI_API_KEY}`);
  return result.data
}