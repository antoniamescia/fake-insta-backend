// --------------------- CONFIGS --------------------- //

const dbo = require("./db/conn.js");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const multer = require("multer");
const dotenv = require("dotenv");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const sharp = require("sharp");

const { v4: uuidv4 } = require("uuid");

dotenv.config();

const PORT = process.env.PORT || 5000;

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region: bucketRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

upload.single("file"); //This is the name of the form field in the HTML

const corsOptions = {
  origin: "http://localhost:4200",
  optionsSuccessStatus: 200,
};

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(require("./routes/posts"));
app.use(bodyParser.json({ limit: "10mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

dbo.connectToServer(function (err) {
  if (err) {
    console.error(err);
    process.exit();
  }

  // start the Express server
  app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
  });
});

// ------------------------------ POST ENDPOINTS ------------------------------ //

// POST new post
app.post("/api/posts", upload.single("file"), async (req, res) => {
  const dbConnect = dbo.getDb();
  const S3Id = uuidv4();

  const buffer = await sharp(req.file.buffer)
    .resize({ height: 1000, width: 1000, fit: "cover" })
    .toBuffer();

  const params = {
    Bucket: bucketName,
    Key: S3Id,
    Body: buffer,
    ContentType: req.file.mimetype,
  };

  const command = new PutObjectCommand(params);
  await s3.send(command);

  dbConnect
    .collection("posts")
    .insertOne({
      _id: uuidv4(),
      caption: req.body.caption,
      searchTerm: req.body.searchTerm,
      S3Id: S3Id,
      postedBy: req.body.postedBy,
    });

  //TODO: add error handling
  res.status(200).send({ message: "File uploaded successfully", status: 200 });
});

// GET all posts from DB and assign signed URL to each post
app.get("/api/posts", async (req, res) => {
  const dbConnect = dbo.getDb();
  const posts = await dbConnect.collection("posts").find({}).toArray();

  for (const post of posts) {
    const getObjectParams = {
      Bucket: bucketName,
      Key: post.S3Id,
    };

    const command = new GetObjectCommand(getObjectParams);
    // Get a presigned URL for the command. The URL is valid for 60 minutes as of now. Reevaluate a better time frame.
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    post.imageUrl = url;
  }

  //TODO: add error handling
  res.status(200).send({ posts, message: "Posts fetched successfully" });
});

//GET post by ID
app.get("/api/posts/:id", async (req, res) => {
  if (req == null) {
    res.status(400).send({ message: "No request provided" });
    return;
  }

  const dbConnect = dbo.getDb();
  const post = await dbConnect
    .collection("posts")
    .findOne({ _id: req.params.id }, function (err, result) {
      if (err) {
        res.status(400).send({ message: "Error fetching post" });
        return;
      }
    });

  const getObjectParams = {
    Bucket: bucketName,
    Key: post._id,
  };

  const command = new GetObjectCommand(getObjectParams);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  post.imageUrl = url;

  //TODO: add error handling
  res.status(200).send({ post, message: "Posts fetched successfully" });
});

//DELETE post by ID
app.delete("/api/posts/:id", async (req, res) => {
  const dbConnect = dbo.getDb();
  const post = await dbConnect
    .collection("posts")
    .findOne({ _id: req.params.id });

  if (!post) {
    res.status(404).send({ message: "Post not found" });
    return;
  }

  const deleteObjectParams = {
    Bucket: bucketName,
    Key: post.S3Id,
  };

  const command = new DeleteObjectCommand(deleteObjectParams);
  await s3.send(command);

  await dbConnect.collection("posts").deleteOne({ _id: req.params.id });

  res.status(200).send({ message: "Post deleted successfully" });
});

// SEARCH posts by search term
app.get("/api/posts/search/:searchTerm", async (req, res) => {
  const dbConnect = dbo.getDb();
  const posts = await dbConnect
    .collection("posts")
    .find({ searchTerm: { $regex: req.params.searchTerm } })
    .toArray();

  for (const post of posts) {
    const getObjectParams = {
      Bucket: bucketName,
      Key: post.S3Id,
    };

    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    post.imageUrl = url;
  }

  //TODO: add error handling
  res.status(200).send({ posts, message: "Posts fetched successfully" });
});

// ------------------ USER ENDPOINTS ------------------- //

// POST new user
app.post("/api/users", upload.single("file"), async (req, res) => {
  const dbConnect = dbo.getDb();

  const user = await dbConnect
    .collection("users")
    .findOne({ username: req.body.username });

  if (user) {
    res.status(400).send({ message: "User already exists" });
    return;
  }

  const S3Id = uuidv4();
  const buffer = await sharp(req.file.buffer)
    .resize({ height: 1000, width: 1000, fit: "cover" })
    .toBuffer();

  const params = {
    Bucket: bucketName,
    Key: S3Id,
    Body: buffer,
    ContentType: req.file.mimetype,
  };

  const command = new PutObjectCommand(params);
  await s3.send(command);

  await dbConnect.collection("users").insertOne({
    _id: uuidv4(),
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    username: req.body.username,
    posts: req.body.posts,
    profilePicture: S3Id,
  });

  res.status(200).send({ message: "User created successfully" });
});

// GET users
app.get("/api/users", async (req, res) => {
  const dbConnect = dbo.getDb();
  const users = await dbConnect.collection("users").find({}).toArray();

  for (const user of users) {
    const getObjectParams = {
      Bucket: bucketName,
      Key: user.profilePicture,
    };

    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    user.profilePictureUrl = url;
  }

  res.status(200).send({ users, message: "Users fetched successfully" });
});

// GET user by ID
app.get("/api/users/:id", async (req, res) => {
  const dbConnect = dbo.getDb();
  const user = await dbConnect
    .collection("users")
    .findOne({ _id: req.params.id });

  const getObjectParams = {
    Bucket: bucketName,
    Key: user.profilePicture,
  };

  const command = new GetObjectCommand(getObjectParams);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  user.profilePictureUrl = url;

  res.status(200).send({ user, message: "User fetched successfully" });
});
