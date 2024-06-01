require("dotenv").config();

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion } = require("mongodb");
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
    // const managerCollection = client.db("assetDB").collection("managers");
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

    // manager related api
    // app.get("/manager/:email", async (req, res) => {
    //   const { email } = req.params ?? {};
    //   const result = await managerCollection.findOne({ email });
    //   res.send(result);
    // });

    app.post("/managers", async (req, res) => {
      const hrDAta = req.body;
      const result = await managerCollection.insertOne(hrDAta);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const priceInCent = parseFloat(price) * 100;
      console.log(priceInCent, "--------------> price");
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
