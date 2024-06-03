require("dotenv").config();

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6ze9kj8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const employeeCollection = client.db("assetDB").collection("employees");
    const assetCollection = client.db("assetDB").collection("assets");
    const paymentCollection = client.db("assetDB").collection("payments");

    // employee related api
    app.post("/employees", async (req, res) => {
      const employee = req.body;
      const result = await employeeCollection.insertOne(employee);
      res.send(result);
    });

    // get single employee data
    app.get("/employee/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email, role: "HR" };
      const result = await employeeCollection.findOne(query);
      res.send(result);
    });

    // get a employee role
    app.get("/employee/role/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email, "roll----------------------------");
      const result = await employeeCollection.findOne({ email });
      res.send(result);
    });

    // update employee property
    app.patch("/employee/:email", async (req, res) => {
      const email = req.params.email;
      const status = req.body.status;
      console.log(status);
      const query = { email };
      const updateDoc = {
        $set: {
          status,
        },
      };
      const result = await employeeCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // asset related api
    app.get("/assets", async (req, res) => {
      // TODO: search, filter, sorting
      const result = await assetCollection.find().toArray();
      res.send(result);
    });

    // get all requested assets for employee
    app.get("/my-requested-assets/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "requester_info.email": email };
      const result = await assetCollection.find(query).toArray();
      res.send(result);
    });

    // get all request ass for hr
    app.get("/assets/all-requests/:email", async (req, res) => {
      // TODO: search functionality implemented
      const email = req.params?.email;
      const query = {
        "provider_info.email": email,
        request_count: { $gte: 0 },
      };
      const result = await assetCollection.find(query).toArray();
      res.send(result);
    });

    // add a asset to db
    app.post("/assets", async (req, res) => {
      const assetData = req.body;
      const result = await assetCollection.insertOne(assetData);
      res.send(result);
    });

    // my requested asset status update to cancel
    app.patch("/my-requested-asset/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };

      let updateDoc;
      if (status === "cancel") {
        updateDoc = {
          $set: { status },
        };
      } else if (status === "return") {
        updateDoc = {
          $set: { status },
          $inc: { product_quantity: 1 },
        };
      }

      const result = await assetCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update some property by id
    app.patch("/asset/update/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id, "-----------id");
      const assetInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...assetInfo,
        },
        $inc: { request_count: 1 },
      };
      const result = await assetCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // update request asset property by id
    app.patch("/asset/req-asset/:id", async (req, res) => {
      const id = req.params.id;
      const updatedAssetData = req.body;

      console.log(updatedAssetData, "---------from client");

      // Create the initial update document
      const updateDoc = {
        $set: {
          ...updatedAssetData,
        },
        $inc: { product_quantity: -1, request_count: 1 },
      };

      // First update: Decrease product quantity and update other fields
      const result = await assetCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      // Second update: Check and set availability if product_quantity is less than 1
      await assetCollection.updateOne(
        { _id: new ObjectId(id), product_quantity: { $lt: 1 } },
        { $set: { availability: "Out of stock" } }
      );

      res.send(result);
    });

    // delete a asset by id
    app.delete("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const result = await assetCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ result, r });
    });

    // create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const priceInCent = parseFloat(price) * 100;
      // console.log(priceInCent, "--------------> price");
      if (!price || priceInCent < 1) return;
      // generate client secrete
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      // send client secret as response
      res.send({ clientSecret: client_secret });
    });

    // add payment to db
    app.post("/payments", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });

    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send({ message: "Asset management system!!" });
});

app.listen(port, () => {
  console.log(`app listen on port ${port}`);
});
