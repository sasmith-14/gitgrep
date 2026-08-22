const { Client } = require("@elastic/elasticsearch");
const { getEmbedding } = require("../../services/embedding");
const client = new Client({node: "http://localhost:9200"});

async function searchRepos(query, filters = {}) {
  const embedding = await getEmbedding(query);

  const filterClauses = [];
  if (filters.minStars) {
    filterClauses.push({ range: { stars: { gte: filters.minStars } } });
  }

  const result = await client.search({
    index: "repos",
    query: {
      bool: {
        must: {
          multi_match: {
            query: query,
            fields: ["name", "description", "readme"]
          }
        },
        filter: filterClauses
      }
    },
    knn: {
      field: "embedding",
      query_vector: embedding,
      k: 5,
      num_candidates: 50
    }
  });

  return result.hits.hits;
}

module.exports = { searchRepos };