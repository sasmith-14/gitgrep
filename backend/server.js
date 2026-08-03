const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const searchRoutes = require("./routes/search");
app.use("/search", searchRoutes);

app.get("/", (req, res) => {
    res.send("server running");
});

app.listen(5050, () => {
    console.log("Server running on port 5050");
});
