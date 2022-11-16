const router = express.Router();
const express = require("express");
const dbo = require("../db/conn.js");

// GET user by id
router.route("/users/:id").get(function (req, res) {
  const dbConnect = dbo.getDb();
  const id = req.params.id;

  dbConnect
    .collection("users")
    .findOne({ _id: parseInt(id) }, function (err, result) {
      if (!result) {
        res.status(404).send("User not found.");
      } else if (err) {
        res.status(400).send("Error fetching user.");
      } else {
        res.json(result);
      }
    });
});

module.exports = router;
