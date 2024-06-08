require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
  })
);

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

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  // console.log(token, "token-------------------------");
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    console.log(decoded, "user form client --------------------------------");
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const employeeCollection = client.db("assetDB").collection("employees");
    const assetCollection = client.db("assetDB").collection("assets");
    const paymentCollection = client.db("assetDB").collection("payments");
    const teamCollection = client.db("assetDB").collection("teams");
    const requestedAssetCollection = client
      .db("assetDB")
      .collection("requestedAssets");

    // jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    // team related api
    // get my team data by email
    app.get("/my-team/:email", async (req, res) => {
      // console.log("-----------------call");
      const email = req.params.email;
      const query = { "hr_info.email": { $regex: email, $options: "i" } };
      const result = await teamCollection.find(query).toArray();
      res.send(result);
    });

    // added multiple team member at once
    app.post("/teams/multiple", async (req, res) => {
      const teams = req.body;

      // get HR email
      const hrEmail = teams[0]?.hr_info?.email.toLowerCase();
      // console.log(hrEmail);

      // convert all employee id to object ID
      const empIds = teams
        ?.reduce((acc, cur) => {
          acc.push(cur.employeeId);
          return acc;
        }, [])
        .map((id) => new ObjectId(id));

      // update each employee isJoin property value false to true whose id match with empIds
      await employeeCollection.updateMany(
        {
          _id: { $in: empIds },
        },
        {
          $set: { isJoin: true },
        }
      );

      // added a employee count property on HR document and every time add a employee employee count increased by teams.length
      await employeeCollection.updateOne(
        { email: hrEmail },
        {
          $inc: { employee_count: teams.length },
        }
      );

      // add multiple team member to db
      const result = await teamCollection.insertMany(teams);
      res.send(result);
    });

    app.post("/teams/single", async (req, res) => {
      const teamMemberData = req.body;
      console.log(teamMemberData);

      //employee status update isJoin false to true
      const employeeQuery = { email: teamMemberData.employee_info.email };
      await employeeCollection.updateOne(employeeQuery, {
        $set: { isJoin: true },
      });

      // added a employee count property on HR document and every time add a employee employee count increased by 1
      const hrQuery = { email: { $regex: teamMemberData.hr_info.email } };
      await employeeCollection.updateOne(hrQuery, {
        $inc: { employee_count: 1 },
      });

      // add team member to db
      const result = await teamCollection.insertOne(teamMemberData);
      res.send(result);
    });

    // delete team member by id
    app.delete("/team/:id", async (req, res) => {
      const data = req.query;
      const id = req.params.id;

      //update employ isJoin property true to false
      const empQuery = { email: { $regex: data?.empEmail, $options: "i" } };
      await employeeCollection.updateOne(empQuery, {
        $set: { isJoin: false },
      });

      // update hr data member count decrease by 1
      const hrQuery = { email: { $regex: data?.hrEmail, $options: "i" } };
      await employeeCollection.updateOne(hrQuery, {
        $inc: { employee_count: -1 },
      });
      // delete member from db
      const result = await teamCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // employee related api

    // get all employees who are not join any team
    app.get("/employees/not-affiliated", async (req, res) => {
      //TODO: search,filter,sort
      const query = { isJoin: false };
      const result = await employeeCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/employees", async (req, res) => {
      const employee = req.body;
      const result = await employeeCollection.insertOne(employee);
      res.send(result);
    });

    // get single employee data
    app.get("/employee/:email", async (req, res) => {
      const email = req.params.email;
      // const role = req.query.role;
      // console.log(role);
      const query = { email: { $regex: email, $options: "i" } };
      const result = await employeeCollection.findOne(query);
      res.send(result);
    });

    // get a employee role
    app.get("/employee/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: { $regex: email, $options: "i" } };
      // console.log(email, "roll----------------------------");
      const result = await employeeCollection.findOne(query);
      res.send(result);
    });

    // when payment is successful update some property HR document
    app.patch("/employee/payment/:email", async (req, res) => {
      const email = req.params.email;
      const { price } = req.body;

      const members = price === 5 ? 5 : price === 8 ? 10 : 20;
      // check if the user payment first time or purchase for increase limit
      const isMemberLimitExist = await employeeCollection.findOne({
        email: email,
      });
      console.log(isMemberLimitExist, "------------------------->");
      let updateDoc;
      if (!isMemberLimitExist?.member_limit) {
        console.log("I am if condition");
        updateDoc = {
          $set: {
            "package_info.price": price,
            "package_info.members": members,
            payment_status: "success",
            member_limit: members,
          },
        };
      } else {
        console.log("I am else condition");
        updateDoc = {
          $set: {
            "package_info.price": price,
            "package_info.members": members,
          },
          $inc: { member_limit: members },
        };
      }
      const result = await employeeCollection.updateOne(
        { email: email },
        updateDoc
      );
      res.send(result);
    });

    // asset related api
    app.get("/assets", async (req, res) => {
      // TODO: pagination
      const filter = req?.query?.filter;
      const sort = req?.query?.sort;
      const search = req?.query?.search;
      console.log(filter);
      // set filter field conditionally
      let field;
      if (filter === "Returnable" || filter === "Non-returnable") {
        field = "product_type";
      } else if (filter === "Available" || filter === "Out of stock") {
        field = "availability";
      }

      // add filter query
      let query;
      if (filter) {
        query = { [field]: filter };
      }

      // search query
      if (search) {
        query = { product_name: { $regex: search, $options: "i" } };
      }

      console.log(search);

      //set field conditionally
      let sortField;
      if (sort === "date-asc" || sort === "date-dsc") {
        sortField = "added_date";
      } else if (sort === "quantity-asc" || sort === "quantity-dsc") {
        sortField = "product_quantity";
      }

      let sortQuery;
      if (sort) {
        sortQuery = { [sortField]: sort.split("-")[1] === "asc" ? 1 : -1 };
      }

      const result = await assetCollection
        .find(query)
        .sort(sortQuery)
        .toArray();
      res.send(result);
    });

    // get asset list data for HR specific data
    app.get("/assets/hr/:email", async (req, res) => {
      // TODO: pagination
      const email = req.params.email.toLowerCase();
      const filter = req?.query?.filter;
      const sort = req?.query?.sort;
      const search = req?.query?.search;

      // set filter field conditionally
      let field;
      if (filter === "Returnable" || filter === "Non-returnable") {
        field = "product_type";
      } else if (filter === "Available" || filter === "Out of stock") {
        field = "availability";
      }

      // add filter query
      let query = { "provider_info.email": email };
      if (filter) {
        query = { [field]: filter };
      }

      // search query
      if (search) {
        query = { product_name: { $regex: search, $options: "i" } };
      }

      console.log(search);

      //set field conditionally
      let sortField;
      if (sort === "date-asc" || sort === "date-dsc") {
        sortField = "added_date";
      } else if (sort === "quantity-asc" || sort === "quantity-dsc") {
        sortField = "product_quantity";
      }

      let sortQuery;
      if (sort) {
        sortQuery = { [sortField]: sort.split("-")[1] === "asc" ? 1 : -1 };
      }

      const result = await assetCollection
        .find(query)
        .sort(sortQuery)
        .toArray();
      res.send(result);
    });

    // get single asset data by id
    app.get("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assetCollection.findOne(query);
      res.send(result);
    });

    // get all requested assets for employee
    app.get("/assets/requested-assets/:email", async (req, res) => {
      const search = req?.query?.search;
      const filter = req?.query?.filter;
      const email = req.params.email;

      const query = { "requester_info.email": email };
      //if search value is present then add search property to query
      if (search) {
        query.product_name = { $regex: search, $options: "i" };
      }

      // if filter value is present then add filter property ot query
      let filterField;
      if (filter) {
        if (filter === "pending" || filter === "approve") {
          filterField = "status";
        } else if (filter === "Returnable" || filter === "Non-returnable") {
          filterField = "product_type";
        }
        query[filterField] = filter;
      }

      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });

    // get all request ass for hr
    app.get("/assets/all-requests/:email", async (req, res) => {
    
      const email = req.params?.email.toLowerCase();
      const search = req?.query?.search;

      let query;
      if (search) {
        query = {
          "provider_info.email": email,
          $or: [
            {
              "requester_info.email": { $regex: search, $options: "i" },
            },
            {
              "requester_info.name": { $regex: search, $options: "i" },
            },
          ],
        };
      } else {
        query = {
          "provider_info.email": email,
        };
      }

      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });

    // get all pending request for HR Manager
    app.get("/assets/pending-request/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const pipeline = [
        {
          $match: {
            status: "pending",
            "provider_info.email": email,
          },
        },
      ];
      const result = await requestedAssetCollection
        .aggregate(pipeline)
        .toArray();
      res.send(result);
    });

    // get top most requested items
    app.get("/assets/top-request/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const pipeline = [
        {
          $match: { "provider_info.email": email },
        },
        {
          $sort: { request_count: -1 },
        },
        {
          $limit: 4,
        },
      ];
      const result = await assetCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // get limited stock items for HR manager
    app.get("/assets/limited-stock/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const pipeline = [
        {
          $match: {
            "provider_info.email": email,
            product_quantity: { $lt: 10 },
          },
        },
      ];

      const result = await assetCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // get total returnable and non returnable count
    app.get("/assets/count/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const pipeline = [
        {
          $match: {
            "provider_info.email": email,
            status: "pending",
          },
        },
        {
          $group: {
            _id: "$product_type",
            count: { $sum: 1 },
          },
        },
      ];
      const results = await assetCollection.aggregate(pipeline).toArray();

      const counts = {
        returnable: 0,
        nonReturnable: 0,
      };

      results.forEach((result) => {
        if (result._id === "Returnable") {
          counts.returnable = result.count;
        } else if (result._id === "Non-returnable") {
          counts.nonReturnable = result.count;
        }
      });

      res.send(counts);
    });

    /**
     * FOR EMPLOYEE
     *
     */

    //get all pending request for employee
    app.get("/assets/e/pending-request/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      const pipeline = [
        {
          $match: {
            "requester_info.email": email,
            status: "pending",
          },
        },
      ];
      const result = await assetCollection.aggregate(pipeline).toArray();
      res.send(result);
    });
    //TODO:
    // get all my monthly request
    app.get("/assets/e/monthly-request/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayOfNextMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
      );

      // const now = new Date();
      // const firstDayOfMonth = new Date(
      //   Date.UTC(now.getFullYear(), now.getMonth(), 1)
      // );
      // const firstDayOfNextMonth = new Date(
      //   Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)
      // );

      console.log("Email:", email);
      console.log("First Day of Month:", firstDayOfMonth);
      console.log("First Day of Next Month:", firstDayOfNextMonth);

      const pipeline = [
        {
          $match: {
            "requester_info.email": email,
            requested_date: {
              $gte: firstDayOfMonth,
              $lt: firstDayOfNextMonth,
            },
          },
        },
      ];

      const result = await assetCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // add a asset to db
    app.post("/assets", async (req, res) => {
      const assetData = req.body;
      const result = await assetCollection.insertOne(assetData);
      res.send(result);
    });

    // update a single asset data by id
    app.patch("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...updateData,
        },
      };

      const result = await assetCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // my requested asset handle return button functionality
    app.patch("/asset/request/return", async (req, res) => {
      const { reqId, assetId } = req?.body || {};

      // update status to return
      const result = await requestedAssetCollection.updateOne(
        { _id: new ObjectId(reqId) },
        {
          $set: { status: "return" },
        }
      );

      // increment asset quantity by 1
      await assetCollection.updateOne(
        { _id: new ObjectId(assetId) },
        {
          $inc: { product_quantity: 1 },
        }
      );

      res.send(result);
    });

    // requested asset collection related api
    app.post("/asset/request", async (req, res) => {
      const asset = req.body;
      const id = req.body?.requestedAssetId;

      // check already request or not
      const requestedAssetId = asset?.requestedAssetId;
      const reqEmail = asset?.requester_info?.email.toLowerCase();
      const alreadyRequest = await requestedAssetCollection.findOne({
        $and: [
          {
            "requester_info.email": reqEmail,
          },
          { requestedAssetId },
        ],
      });

      if (alreadyRequest) {
        return res.send({ insertedId: null });
      }

      // added request asset data
      const result = await requestedAssetCollection.insertOne(asset);

      // increment asset request count and decrement product quantity
      const query = { _id: new ObjectId(id) };

      await assetCollection.updateOne(query, {
        $inc: { request_count: 1 },
      });

      // if product quantity is less than the update the product availability Available to Out of stock
      // await assetCollection.updateOne(
      //   { product_quantity: { $lt: 1 } },
      //   {
      //     $set: { availability: "Out of stock" },
      //   }
      // );

      res.send(result);
    });

    // update some property by id
    app.patch("/asset/update/:id", async (req, res) => {
      const id = req.params.id;
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

    app.patch("/asset/request/approve", async (req, res) => {
      const data = req?.body;

      // Create the initial update document
      const updateDoc = {
        $set: {
          status: data?.status,
          approve_date: data?.approve_date,
        },
      };

      // First update: Decrease product quantity and update other fields
      const result = await requestedAssetCollection.updateOne(
        { _id: new ObjectId(data?.reqId) },
        updateDoc
      );

      // Second: decrease product quantity by 1
      await assetCollection.updateOne(
        { _id: new ObjectId(data?.assetId) },
        {
          $inc: { product_quantity: -1 },
        }
      );

      // Third update: Check and set availability if product_quantity is less than 1
      await assetCollection.updateOne(
        { _id: new ObjectId(data?.assetId), product_quantity: { $lt: 1 } },
        {
          $set: { availability: "Out of stock" },
        }
      );

      res.send(result);
    });

    // handle reject button functionality
    app.patch("/asset/update-status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body?.status;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };
      const result = await requestedAssetCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete a asset by id
    app.delete("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const result = await assetCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
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

    // get my team for employee
    app.get("/my-teams/e/:email", async (req, res) => {
      const email = req.params.email.toLowerCase();
      console.log(email, "==============email");
      const team = await teamCollection.findOne({
        "employee_info.email": email,
      });
      const query = { teamId: team?.teamId };
      const result = await teamCollection.find(query).toArray();
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
