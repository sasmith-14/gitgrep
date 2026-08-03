const express = require("express");
const router = express.Router();
const { searchRepos } = require("./elasticsearch");

router.get("/", async (req, res) => {
    const query = req.query.q;

    if(!query) {
        return res.status(400).json({error : "no query found"});
    }

    const results = await searchRepos(query);
    res.json(results);
});

module.exports = router;