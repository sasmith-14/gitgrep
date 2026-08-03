const { Client } = require("@elastic/elasticsearch");

const client = new Client({node: "http://localhost:9200"});

async function searchRepos(query) {
  const result = await client.search({
    index: "repos",
    query: {
      multi_match: {
        query: query,
        fields: ["name", "description", "readme"]
      }
    }
  });
  return result.hits.hits;
}

module.exports = { searchRepos };