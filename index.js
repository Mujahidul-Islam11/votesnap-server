const express = require("express");
const app = express();
const moment = require("moment");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.SECRET_KEY);
const port = process.env.PORT || 5000;
var jwt = require("jsonwebtoken");
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.u8ojnwq.mongodb.net/?retryWrites=true&w=majority`;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const userCollection = client.db("yooSurvey").collection("users");
    const surveyCollection = client.db("yooSurvey").collection("surveys");
    const commentsCollection = client.db("yooSurvey").collection("comments");
    const voteCollection = client.db("yooSurvey").collection("voting");
    const paymentCollection = client.db("yooSurvey").collection("payments");

    // token creation and passing logic
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: "1h" });
      res.send({ token });
    });

    // Verification Middlewares
    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);

      if (!user || user.role !== "Admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    const verifySurveyor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await userCollection.findOne(query);

      if (!user || user.role !== "Surveyor") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    app.get("/vote", async (req, res) => {
      const result = await voteCollection.find().toArray();
      res.send(result);
    });

    // payment api's
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const body = req.body;
      const paymentResult = await paymentCollection.insertOne(body);
      const email = body.email;
      const filter = { email: email };
      const exist = await paymentCollection.findOne(filter);
      if (exist) {
        try {
          const updateDoc = {
            $set: {
              role: "Pro User",
            },
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          console.log(result);
          res.send(paymentResult);
        } catch (error) {
          console.error("Error updating user role:", error.message);
          res.status(500).json({ error: "Failed to update user role" });
        }
      }
    });

    app.get("/paymentsHistory", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // public comment api's
    app.post("/comments", async (req, res) => {
      const cursor = {
        ...req.body,
        timestamp: moment().format("YYYY-MM-DD HH:mm a"),
      };
      const result = await commentsCollection.insertOne(cursor);
      res.send(result);
    });

    app.get("/comments", async (req, res) => {
      const surveyId = req.body.surveyId;
      const result = await commentsCollection.find(surveyId).toArray();
      res.send(result);
    });

    // survey management api's
    app.get("/unPublished/:email", async (req, res) => {
      const user = req.params.email;
      const query = { email: user, status: "UnPublished" };
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/surveyor/:email", async (req, res) => {
      const user = req.params.email;
      const query = { email: user, status: "Published" };
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/surs/:email", async (req, res) => {
      const user = req.params.email;
      const query = { email: user, status: "Published" };
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/edit/:email/:id", async (req, res) => {
      const user = req.params.email;
      const id = req.params.id;
      const query = { email: user, status: "Published", _id: new ObjectId(id) };
      const result = await surveyCollection.findOne(query);
      res.send(result);
    });

    app.get("/surveyor", async (req, res) => {
      const query = { status: "Published" };
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/surveys", async (req, res) => {
      const body = req.body;
      const surveyData = {
        ...body,
        timestamp: moment().format("YYYY-MM-DD"),
      };
      const result = await surveyCollection.insertOne(surveyData);
      res.send(result);
    });

    app.patch("/surveys/like/:id", async (req, res) => {
      const id = req.params.id;
      const likeCount = Number(req.body.likeCount);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          likeCount: likeCount + 1,
        },
      };

      try {
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    app.patch("/surveys/dislike/:id", async (req, res) => {
      const id = req.params.id;
      const dislikeCount = Number(req.body.dislikeCount);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          dislikeCount: dislikeCount + 1,
        },
      };

      try {
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    app.patch("/editsurvey/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          title: data?.title,
          description: data?.description,
          category: data?.category,
          deadline: data?.deadline,
        },
      };

      try {
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    app.patch("/surveys/publish/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const date = moment().format("YYYY-MM-DD");
      const updateDoc = {
        $set: {
          status: "Published",
          publishedDate: date,
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/surveys/unPublish/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "UnPublished",
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.put("/sur/feedback/:id", async (req, res) => {
      const id = req.params.id;
      const feedback = req.body.feedback;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.put("/report/:id", async (req, res) => {
      const id = req.params.id;
      const report = req.body.report;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          report: report,
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.put("/surveys/serveyId/:id", async (req, res) => {
      const id = req.params.id;
      const surveyId = req.body.surveyId;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          surveyId: surveyId,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/surveys", async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });

    app.get("/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.findOne(query);
      res.send(result);
    });

    app.patch("/details/:id", async (req, res) => {
      const id = req.params.id;
      const likeCount = Number(req.body.likeCount);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          likeCount: likeCount + 1,
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/dislike/:id", async (req, res) => {
      const id = req.params.id;
      const dislikeCount = Number(req.body.dislikeCount);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          dislikeCount: dislikeCount + 1,
        },
      };
      const result = await surveyCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // yes no voted count update route
    app.patch("/yes/:email/:id", async (req, res) => {
      const id = req.params.id;
      const emailQuery = req.params.email;
      const userName = req.body.userName;
      const vote = req.body.vote;
      const title = req.body.title;
      const category = req.body.category;
      const report = req.body.report;
      const yesVoted = Number(req.body.yesVoted);
      const bodyData = {
        email: emailQuery,
        userName,
        vote,
        surveyId: id,
        category,
        title,
        report,
        timestamp: moment().format("YYYY-MM-DD HH:mm a"),
      };
      const query = { _id: new ObjectId(id) };
      const filter = { email: emailQuery, surveyId: id };
      const existingVote = await voteCollection.findOne(filter);

      if (!existingVote) {
        const postResult = await voteCollection.insertOne(bodyData);
        const updateDoc = {
          $set: {
            yesVoted: yesVoted + 1,
          },
        };
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send({ result, postResult });
      }
      if (existingVote) {
        const postResult = await voteCollection.deleteOne(filter);
        const updateDoc = {
          $set: {
            yesVoted: yesVoted - 1,
          },
        };
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send({ result, postResult });
      }
    });

    app.patch("/no/:email/:id", async (req, res) => {
      const id = req.params.id;
      const emailQuery = req.params.email;
      const userName = req.body.userName;
      const vote = req.body.vote;
      const title = req.body.title;
      const category = req.body.category;
      const report = req.body.report;
      const noVoted = Number(req.body.noVoted);
      const bodyData = {
        email: emailQuery,
        userName,
        vote,
        surveyId: id,
        category,
        title,
        report,
        timestamp: moment().format("YYYY-MM-DD HH:mm a"),
      };
      const query = { _id: new ObjectId(id) };
      const filter = { email: emailQuery, surveyId: id };
      const existingVote = await voteCollection.findOne(filter);

      if (!existingVote) {
        const postResult = await voteCollection.insertOne(bodyData);
        const updateDoc = {
          $set: {
            noVoted: noVoted + 1,
          },
        };
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send({ result, postResult });
      }
      if (existingVote) {
        const postResult = await voteCollection.deleteOne(filter);
        const updateDoc = {
          $set: {
            noVoted: noVoted - 1,
          },
        };
        const result = await surveyCollection.updateOne(query, updateDoc);
        res.send({ result, postResult });
      }
    });

    // user management api's
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({
          message: "This user is already there in the database",
          insertedId: null,
        });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin,  async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/users/surveyor/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Surveyor",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("yoo is runnig in speed");
});

app.listen(port, () => {
  console.log(`yoo is running in speed on port ${port}`);
});
