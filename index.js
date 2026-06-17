const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
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

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))

// middle wires

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || ! authHeader.startsWith('Bearer')) {
    return res.status(401).json({message: 'Unauthorized access'})
  }
  
  const token = authHeader.split(" ")[1]
  
  if (!token) {
    return res.status(401).json({message: 'Unauthorized access'})
    
  }

  try {
    const {payload} = await jwtVerify(token, JWKS)
    // console.log(" verify middle weire got ", payload)
    req.user = payload;
    next()
  } catch (error) {
    return res.status(401).json({message: 'Unauthorized access'})
    
  }
}

const sellerVerify = async (req , res , next ) => {
  const user = req?.user

  if (user?.role == 'seller') {
    console.log(user?.role , ' user in sellerverify')
    next()
  }
}

async function run() {
  try {
    await client.connect();
    const db = client.db("tech-bazaar");
    const userCollection = db.collection('user');
    const subscriptionCollection = db.collection('subscriptions')
    const productCollection = db.collection('products')


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


    // Products
    app.post('/seller/product', verifyToken, sellerVerify , async ( req , res ) => {
      const data = req.body
      const result = await productCollection.insertOne(data);
      res.send(result)
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
