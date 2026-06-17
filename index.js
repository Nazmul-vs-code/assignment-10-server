const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
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
    await client.connect();
    const db = client.db("tech-bazaar");
    const userCollection = db.collection('user');
    const subscriptionCollection = db.collection('subscriptions')


    app.get('/users', async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send(users)
    })

    app.post('/subscription', async (req, res) => {
      const { sessionId, userId, priceId } = req.body
      const items = { sessionId, userId, priceId }
      
      const isExist = await subscriptionCollection.findOne({sessionId})
      if (isExist) {
        return res.json({msg: "Already exist!! "})
      }

      const result = await subscriptionCollection.insertOne(items)


      //update user's role
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: 'pro' } }

      )

      res.json({ msg: "Payment successful !!" })
    })

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
  } finally {

  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
