const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

async function main() {
  await mongoose.connect(
    
    `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1ejwnc7.mongodb.net/?appName=Cluster0`,
    // const uri = "mongodb+srv://<db_username>:<db_password>@cluster0.1ejwnc7.mongodb.net/?appName=Cluster0"
    { dbName: "ContestHubDB" }
  );
  const jwtSchema = new mongoose.Schema({
    email: String,
  });
  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String,
  });
  const contestSchema = new mongoose.Schema({
    contestName: String,
    image: String,
    description: String,
    price: Number,
    prize: Number,
    instruction: String,
    contestType: String,
    deadline: String,
    attendance: Number,
    creatorName: String,
    creatorImage: String,
    creatorEmail: String,
    status: String,
    winnerEmail: String,
    winnerImage: String,
    winnerName: String,
  });

  const registrationSchema = new mongoose.Schema({
    email: String,
    name: String,
    image: String,
    price: Number,
    contestName: String,
    creatorEmail: String,
    creatorName: String,
    contestId: String,
    transactionId: String,
    contestImage: String,
    deadline: String,
    date: String,
    status: String,
    task: String,
  });

  const JWT = mongoose.model("JWT", jwtSchema, "jwtTokens");
  const User = mongoose.model("User", userSchema, "users");
  const Contest = mongoose.model("Contest", contestSchema, "contests");
  const Registration = mongoose.model(
    "Registration",
    registrationSchema,
    "registrations"
  );

  app.post("/jwt", async (req, res) => {
    try {
      const userData = req.body;
      const user = new JWT(userData);
      const token = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "100d",
        }
      );
      res.send(token);
    } catch (error) {
      console.error("Error generating JWT token:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  const verifyToken = async (req, res, next) => {
    try {
      console.log("inside verify token", req?.headers?.authorization);
      if (!req?.headers?.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req?.headers?.authorization;
      jwt.verify(token, process?.env?.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    } catch (error) {
      console.error("Error verifying token:", error);
      res.status(401).send({ message: "unauthorized access" });
    }
  };

  const verifyAdmin = async (req, res, next) => {
    try {
      const email = await req?.decoded?.email;
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      if (user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error("Error verifying admin:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  };

  app.get("/users", verifyToken, async (req, res) => {
    try {
      const result = await User.find();
      res.send(result);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  app.get("/users/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const result = await User.findOne({ email: email });
      res.send(result);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  app.post("/users", async (req, res) => {
    try {
      const userData = req.body;
      const isExistingUser = await User.findOne({ email: userData.email });

      if (isExistingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const newUser = new User(userData);

      const result = await newUser.save();

      res.send(result);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  app.put("/users/:email", verifyToken, async (req, res) => {
    try {
      const email = req.params.email;
      const role = req.body.role;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: role,
        },
      };
      const result = await User.updateOne(filter, updatedDoc, options);

      res.send(result);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/contests", async (req, res) => {
    try {
      let query = {};
      let sort = {};
      const category = req.query.category;
      const email = req.query.email;
      const verification = req.query.status;
      const sortOrder = req.query.sortOrder;
      const page = Number(req.query.page) - 1;
      const limit = Number(req.query.limit);

      if (category) {
        query.contestType = category;
      }
      if (email) {
        query.creatorEmail = email;
      }
      if (verification) {
        query.status = verification;
      }
      if (sortOrder) {
        sort.attendance = sortOrder;
      }

      const contestCount = await Contest.countDocuments({
        status: "Accepted",
      });

      const allContest = await Contest.find(query)
        .skip(page * limit)
        .sort(sort)
        .limit(limit)
        .exec();

      res.send({ allContest, contestCount });
    } catch (error) {
      console.error("Error fetching contests:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  app.get("/contests/popular", async (req, res) => {
    try {
      let query = {};
      let sort = {};
      const attendance = req.query.attendance;
      const order = req.query.order;
      const searchValue = req.query.searchValue;

      if (attendance && order) {
        sort.attendance = order;
      }

      if (searchValue) {
        const keywords = searchValue.split(/\s+/).filter(Boolean);
        query.contestType = {
          $in: keywords.map((keyword) => new RegExp(keyword, "i")),
        };
      }

      const result = await Contest.find(query).sort(sort).limit(6).exec();

      res.send(result);
    } catch (error) {
      console.error("Error fetching popular contests:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/contests/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await Contest.findById(id);

      if (!result) {
        return res.status(404).send({ message: "Contest not found" });
      }

      res.send(result);
    } catch (error) {
      console.error("Error fetching contest by ID:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.put("/contests/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const updatedContest = req.body;
      const filter = { _id: id };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          contestName: updatedContest.contestName,
          image: updatedContest.image,
          description: updatedContest.description,
          price: updatedContest.price,
          prize: updatedContest.prize,
          instruction: updatedContest.instruction,
          contestType: updatedContest.contestType,
          deadline: updatedContest.deadline,
        },
      };
      const result = await Contest.updateOne(filter, updatedDoc, options);
      res.send(result);
    } catch (error) {
      console.error("Error updating contest:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.put("/contests/attendance/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updatedAttendance = req.body;
      const filter = { _id: id };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          attendance: updatedAttendance.attendance,
        },
      };

      const result = await Contest.updateOne(filter, updatedDoc, options);

      res.send(result);
    } catch (error) {
      console.error("Error updating contest attendance:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.put("/contests/winner/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const winnerData = req.body;
      const filter = { _id: id };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          winnerName: winnerData.winnerName,
          winnerEmail: winnerData.winnerEmail,
          winnerImage: winnerData.winnerImage,
        },
      };
      const result = await Contest.updateOne(filter, updatedDoc, options);
      res.send(result);
    } catch (error) {
      console.error("Error updating contest winner:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.patch("/contests/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const updateInfo = req.body.status;
      const filter = { _id: id };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          status: updateInfo,
        },
      };
      const result = await Contest.updateOne(filter, updatedDoc, options);
      res.send(result);
    } catch (error) {
      console.error("Error updating contest status:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });
  app.post("/contests", verifyToken, async (req, res) => {
    try {
      const data = req.body;
      const newContest = new Contest(data);
      const result = await newContest.save();
      res.send(result);
    } catch (error) {
      console.error("Error creating contest:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.delete("/contests/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const result = await Contest.deleteOne({ _id: id });
      res.send(result);
    } catch (error) {
      console.error("Error deleting contest:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.post("/create-payment-intent", async (req, res) => {
    try {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/registrations/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const query = { creatorEmail: email };
      const result = await Registration.find(query).exec();
      res.send(result);
    } catch (error) {
      console.error("Error fetching registrations:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.post("/registrations", async (req, res) => {
    try {
      const registerData = req.body;
      console.log(registerData);
      const newRegistration = new Registration(registerData);
      const result = await newRegistration.save();
      console.log(result);
      res.send(result);
    } catch (error) {
      console.error("Error creating registration:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.put("/registrations/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const filter = { _id: id };
      const { winner } = req.body;
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          status: winner,
        },
      };
      const result = await Registration.updateOne(filter, updatedDoc, options);
      res.send(result);
    } catch (error) {
      console.error("Error updating registration status:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/bestCreator", async (req, res) => {
    try {
      const result = await Contest.find()
        .sort({ attendance: -1 })
        .limit(3)
        .exec();

      res.send(result);
    } catch (error) {
      console.error("Error fetching best creators:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/winners/advertise", async (req, res) => {
    try {
      const result = await Contest.find({ winnerName: { $exists: true } })
        .limit(6)
        .exec();
      res.send(result);
    } catch (error) {
      console.error("Error fetching winners for advertisement:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.get("/payments/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const query = { email: email };
      const result = await Registration.find(query).exec();
      res.send(result);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
  });
}
main().catch((err) => console.log(err));
app.get("/", (req, res) => {
  res.send("ContestHub is running here!");
});
///
// const express = require("express");
// const cors = require("cors");
// const mongoose = require("mongoose");
// require("dotenv").config();
// const jwt = require("jsonwebtoken");
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors());
// app.use(express.json());

// async function main() {
//   await mongoose.connect(
//     `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1ejwnc7.mongodb.net/ContestHubDB`
//   );

//   // ================= SCHEMA =================
//   const userSchema = new mongoose.Schema({
//     name: String,
//     email: String,
//     role: { type: String, default: "user" },
//   });

//   const contestSchema = new mongoose.Schema({
//     contestName: String,
//     image: String,
//     description: String,
//     price: Number,
//     prize: Number,
//     instruction: String,
//     contestType: String,
//     deadline: String,
//     attendance: { type: Number, default: 0 },
//     creatorName: String,
//     creatorImage: String,
//     creatorEmail: String,
//     status: { type: String, default: "pending" },
//     winnerEmail: String,
//     winnerImage: String,
//     winnerName: String,
//   });

//   const registrationSchema = new mongoose.Schema({
//     email: String,
//     name: String,
//     image: String,
//     contestId: String,
//     contestName: String,
//     creatorEmail: String,
//     transactionId: String,
//     contestImage: String,
//     deadline: String,
//     status: { type: String, default: "pending" },
//     task: String,
//   });

//   const User = mongoose.model("User", userSchema);
//   const Contest = mongoose.model("Contest", contestSchema);
//   const Registration = mongoose.model("Registration", registrationSchema);

//   // ================= JWT =================
//   app.post("/jwt", (req, res) => {
//     const user = req.body;
//     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
//       expiresIn: "7d",
//     });
//     res.send({ token });
//   });

//   const verifyToken = (req, res, next) => {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) return res.status(401).send("Unauthorized");

//     const token = authHeader.split(" ")[1];

//     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//       if (err) return res.status(403).send("Forbidden");
//       req.decoded = decoded;
//       next();
//     });
//   };

//   const verifyAdmin = async (req, res, next) => {
//     const user = await User.findOne({ email: req.decoded.email });
//     if (!user || user.role !== "admin")
//       return res.status(403).send("Forbidden");
//     next();
//   };

//   // ================= USERS =================
//   app.post("/users", async (req, res) => {
//     const data = req.body;
//     const exists = await User.findOne({ email: data.email });
//     if (exists) return res.send({ message: "User exists" });

//     const result = await User.create(data);
//     res.send(result);
//   });

//   app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
//     const result = await User.find();
//     res.send(result);
//   });

//   app.put("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
//     const result = await User.updateOne(
//       { email: req.params.email },
//       { $set: { role: req.body.role } }
//     );
//     res.send(result);
//   });

//   // ================= CONTEST =================
//   app.post("/contests", verifyToken, async (req, res) => {
//     const result = await Contest.create(req.body);
//     res.send(result);
//   });

//   app.get("/contests", async (req, res) => {
//     const { category, status, page = 1, limit = 10 } = req.query;

//     const query = {};
//     if (category) query.contestType = category;
//     if (status) query.status = status;

//     const total = await Contest.countDocuments(query);

//     const contests = await Contest.find(query)
//       .skip((page - 1) * limit)
//       .limit(Number(limit));

//     res.send({ contests, total });
//   });

//   app.get("/contests/:id", async (req, res) => {
//     const contest = await Contest.findById(req.params.id);
//     res.send(contest);
//   });

//   app.patch("/contests/:id", verifyToken, async (req, res) => {
//     const result = await Contest.updateOne(
//       { _id: req.params.id },
//       { $set: req.body }
//     );
//     res.send(result);
//   });

//   app.delete("/contests/:id", verifyToken, async (req, res) => {
//     const contest = await Contest.findById(req.params.id);

//     if (contest.creatorEmail !== req.decoded.email) {
//       return res.status(403).send("Forbidden");
//     }

//     const result = await Contest.deleteOne({ _id: req.params.id });
//     res.send(result);
//   });

//   // ================= PAYMENT =================
//   app.post("/create-payment-intent", verifyToken, async (req, res) => {
//     const { contestId } = req.body;

//     const contest = await Contest.findById(contestId);

//     if (new Date(contest.deadline) < new Date()) {
//       return res.send({ message: "Contest ended" });
//     }

//     const amount = contest.price * 100;

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount,
//       currency: "usd",
//     });

//     res.send({ clientSecret: paymentIntent.client_secret });
//   });

//   // ================= REGISTRATION =================
//   app.post("/registrations", verifyToken, async (req, res) => {
//     const data = req.body;

//     const exists = await Registration.findOne({
//       email: data.email,
//       contestId: data.contestId,
//     });

//     if (exists) return res.status(400).send("Already joined");

//     const result = await Registration.create(data);

//     await Contest.updateOne(
//       { _id: data.contestId },
//       { $inc: { attendance: 1 } }
//     );

//     res.send(result);
//   });

//   app.get("/registrations/:email", verifyToken, async (req, res) => {
//     const result = await Registration.find({ email: req.params.email });
//     res.send(result);
//   });

//   app.patch("/registrations/:id", verifyToken, async (req, res) => {
//     const result = await Registration.updateOne(
//       { _id: req.params.id },
//       { $set: { status: "winner" } }
//     );
//     res.send(result);
//   });

//   // ================= LEADERBOARD =================
//   app.get("/leaderboard", async (req, res) => {
//     const result = await Registration.aggregate([
//       { $match: { status: "winner" } },
//       {
//         $group: {
//           _id: "$email",
//           wins: { $sum: 1 },
//         },
//       },
//       { $sort: { wins: -1 } },
//     ]);

//     res.send(result);
//   });

//   app.listen(port, () => {
//     console.log(`Server running on ${port}`);
//   });
// }

// main();

// app.get("/", (req, res) => {
//   res.send("ContestHub Running");
// });