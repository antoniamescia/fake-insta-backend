const express = require("express");
const dbo = require("../db/conn.js");
const multer = require("multer");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

upload.single('postImage'); //This is the name of the form field in the HTML

// POST new post
router.route("/posts").post(upload.single('postImage'),function (req, res) {
  const dbConnect = dbo.getDb();
  const id = Date.now();
  const newPost = {
    _id: id,
    postImage: req.body.imagePath,
  };

  dbConnect.collection("posts").insertOne(newPost, function (err, result) {
    if (err) {
      res.status(400).send("Error posting picture.");
    } else {
      res
        .status(200)
        .send(`Post added successfully with id ${result.insertedId}`);
    }
  });
});

// GET all posts
router.route("/posts").get(function (req, res) {
  const dbConnect = dbo.getDb();

  dbConnect
    .collection("posts")
    .find({})
    .toArray(function (err, result) {
      if (err) {
        res.status(400).send("Error fetching posts.");
      } else {
        res.json(result);
      }
    });
});

// GET post by id
router.route("/posts/:id").get(function (req, res) {
  const dbConnect = dbo.getDb();
  const id = req.params.id;

  dbConnect
    .collection("posts")
    .findOne({ _id: parseInt(id) }, function (err, result) {
      if (!result) {
        res.status(404).send("Post not found.");
      } else if (err) {
        res.status(400).send("Error fetching post.");
      } else {
        res.json(result);
      }
    });
});

// GET posts by search term
router.route("/posts/search/:term").get(function (req, res) {
  const dbConnect = dbo.getDb();
  const searchTerm = req.params.term;

  dbConnect
    .collection("posts")
    .find({ url: { $regex: searchTerm } })
    .toArray(function (err, result) {
      if (err) {
        res.status(400).send("Error fetching posts.");
      } else {
        res.json(result);
      }
    });
});


module.exports = router;
