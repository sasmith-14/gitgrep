const express = require("express");
const router = express.Router();
const { searchRepos } = require("./elasticsearch");

router.get("/", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const filters = {
    minStars: req.query.minStars ? parseInt(req.query.minStars) : undefined
  };

  try {
    const results = await searchRepos(query, filters);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;