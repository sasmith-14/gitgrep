const axios = require("axios");

async function getEmbedding(text) {
  const response = await axios.post("http://localhost:6000/embed", { text });
  return response.data.embedding;
}

module.exports = { getEmbedding };
