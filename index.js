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

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Unauthorized access' })
  }

  const token = authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized access' })

  }

  try {
    const { payload } = await jwtVerify(token, JWKS)
    // console.log(" verify middle weire got ", payload)
    req.user = payload;
    next()
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized access' })

  }
}

const sellerVerify = async (req, res, next) => {
  const user = req?.user

  if (user?.role == 'seller') {
    console.log(user?.role, ' user in sellerverify')
    next()
  }
}

const buyerVerify = async (req, res, next) => {
  const user = req?.user

  if (user?.role == 'buyer') {
    console.log(user?.role, ' user in sellerverify')
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
    const wishlistCollection = db.collection('wishlist')
    const paymentsCollection = db.collection('payments')


    app.get('/users', async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send(users)
    })

    app.post('/subscription', async (req, res) => {
      const { sessionId, userId, priceId } = req.body
      const items = { sessionId, userId, priceId }

      const isExist = await subscriptionCollection.findOne({ sessionId })
      if (isExist) {
        return res.json({ msg: "Already exist!! " })
      }

      const result = await subscriptionCollection.insertOne(items)


      //update user's role
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: 'pro' } }

      )

      res.json({ msg: "Payment successful !!" })
    })



    // Add this inside your run() function in server.js
    app.post('/payment', verifyToken, async (req, res) => {
      const { sessionId, productId, userId, priceId, Author, userEmail } = req.body;

      try {
        // 1. Check if record exists
        const isExist = await paymentsCollection.findOne({ sessionId });
        if (isExist) {
          return res.json({ msg: "Payment record already exists" });
        }

        // 2. Fetch product details from productCollection
        // Using ObjectId assuming product IDs are stored as ObjectId in MongoDB
        const product = await productCollection.findOne({
          _id: new ObjectId(productId)
        });



        // 3. Prepare payment data with enriched product info
        const paymentData = {
          sessionId,
          productId,
          userId,
          priceId,
          // Default to "Unknown Product" if product details are missing
          productTitle: product?.title || "Unknown Product",
          productImage: product?.images || "",
          productCategory: product?.category || "Product", // Capture category for analytics
          status: 'completed',
          Author,
          userEmail,
          createdAt: new Date()
        };

        // 4. Insert into payments
        const result = await paymentsCollection.insertOne(paymentData);

        res.json({
          msg: "Payment saved successfully!",
          insertedId: result.insertedId
        });
      } catch (error) {
        console.error("Error saving payment:", error);
        res.status(500).json({ error: "Failed to save payment record" });
      }
    });




    // Fetch payment history for the logged-in user
    app.get('/payments', verifyToken, async (req, res) => {
      try {
        const userId = req.user.id;
        const result = await paymentsCollection.find({ userId }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });


    // Get orders received by the seller (based on Author field)
    app.get('/my-orders', verifyToken, async (req, res) => {
      try {
        const sellerId = req.user.id; // Logged-in seller's ID

        // Find all payments where 'Author' matches the seller's ID
        const sellerOrders = await paymentsCollection.find({
          Author: sellerId
        }).toArray();

        res.send(sellerOrders);
      } catch (error) {
        console.error("Error fetching seller orders:", error);
        res.status(500).json({ message: "Failed to fetch seller orders" });
      }
    });

    // Products
    app.post('/seller/product', verifyToken, sellerVerify, async (req, res) => {
      const data = req.body
      const result = await productCollection.insertOne(data);
      res.send(result)
    });


    // DELETE a product
    app.delete('/seller/product/:id', verifyToken, sellerVerify, async (req, res) => {
      try {
        const productId = req.params.id;
        const sellerId = req.user.id;

        // Ensure the product belongs to this seller before deleting
        const result = await productCollection.deleteOne({
          _id: new ObjectId(productId),
          "sellerInfo.userId": sellerId
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Product not found or unauthorized" });
        }

        res.json({ message: "Product deleted successfully", deleted: true });
      } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // PATCH (Edit) a product
    app.patch('/seller/product/:id', verifyToken, sellerVerify, async (req, res) => {
      try {
        const productId = req.params.id;
        const sellerId = req.user.id;
        const updateData = req.body;

        // Update only the fields provided in req.body
        const result = await productCollection.updateOne(
          { _id: new ObjectId(productId), "sellerInfo.userId": sellerId },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Product not found or unauthorized" });
        }

        res.json({ message: "Product updated successfully", updated: true });
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });


    // All public products here
    app.get('/products', async (req, res) => {
      const result = await productCollection.find().toArray()
      res.send(result)
    })


    // Get single product by ID
    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    // Fetch products created by the logged-in seller
    app.get('/my-products', verifyToken, async (req, res) => {
      try {
        const userId = req.user.id; // From verifyToken

        // Use dot notation to query nested fields
        const myProducts = await productCollection.find({
          "sellerInfo.userId": userId
        }).toArray();

        res.send(myProducts);
      } catch (error) {
        console.error("Error fetching user products:", error);
        res.status(500).json({ message: "Failed to fetch products" });
      }
    });

    // wishlists with toggle functinalities

    // Add or Toggle Product to Wishlist
    app.post('/wishlist', verifyToken, async (req, res) => {
      const { productId, productTitle, productImage, productPrice } = req.body;
      const userId = req.user.id; // From verifyToken middleware

      const query = { userId, productId };

      // Check if it already exists to allow "toggling" (remove if exists)
      const isExist = await wishlistCollection.findOne(query);

      if (isExist) {
        const result = await wishlistCollection.deleteOne(query);
        return res.json({ removed: true });
      }

      const result = await wishlistCollection.insertOne({
        ...query,
        productTitle,
        productImage,
        productPrice,
        createdAt: new Date()
      });

      res.json({ inserted: true });
    });

    // DELETE wishlist item
    app.delete('/wishlist/:productId', verifyToken, async (req, res) => {
      try {
        const { productId } = req.params;
        const userId = req.user.id; // From verifyToken middleware

        const query = { userId, productId };

        const result = await wishlistCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Wishlist item not found" });
        }

        res.json({ message: "Wishlist item deleted successfully", deleted: true });
      } catch (error) {
        console.error("Error deleting wishlist:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Fetch Wishlist for specific user
    app.get('/wishlist', verifyToken, async (req, res) => {
      const userId = req.user.id;
      const result = await wishlistCollection.find({ userId }).toArray();
      res.send(result);
    });

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
