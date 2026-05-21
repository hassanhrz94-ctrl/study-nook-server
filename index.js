
const dns = require('node:dns').promises;
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express')
const dotenv = require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId} = require('mongodb');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify  } = require('jose-cjs');
const app = express()
app.use(express.json())
app.use(cors())
const port = process.env.PORT || 5000

const uri = process.env.MONGO_URI;



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const logger = (req, res, next) => {
  console.log(`${req.method} | ${req.url}`);
  next();
};



// for verify token
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));


const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;
  //   console.log(req.headers, 'from verify token');
  const token = authorization?.split(' ')[1];
  //   console.log(token);

  if (!token) {
    return res.status(401).json({ message: 'Unauthorize' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.error('Token validation failed:', error);
    return res.status(401).json({ message: 'Unauthorize' });
  }
};

const database = client.db('study-nook')
const booksCollection = database.collection('books')
const bookingsCollection = database.collection('bookings')
async function run() {
  try {
    
    await client.connect();
   

    // books api and search api
     app.get('/books', async (req, res) => {
      const { search } = req.query;

      let cursor;
     
      if (search) {
    
        cursor = await booksCollection.find({
          $or: [
            {
              title: {
                $regex: search,
                $options: 'i',
              },
            },
            {
              instructor: {
                $regex: search,
                $options: 'i',
              },
            },
          ],
        });
      } else {
        cursor = booksCollection.find();
      }
      const result = await cursor.toArray();
      res.send(result);
    });


    app.get('/books/:booksId', logger, verifyToken,   async (req, res) => {
        const { booksId } = req.params
        const query = { _id: new ObjectId(booksId) }
        const result = await booksCollection.findOne(query)
        res.send(result);
    })
     app.get('/featured', async (req, res) => {
        const cursor = await booksCollection.find().limit(4);
        const result = await cursor.toArray();  
        res.send(result);
    })

      app.get('/booking/:userId', verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await bookingsCollection.find({ userId: userId }).toArray();
      res.send(result);
    });


   app.patch('/books/:booksId', verifyToken, async (req, res) => {

  const { booksId } = req.params;
  const roomData = req.body;

  const room = await booksCollection.findOne({
    _id: new ObjectId(booksId)
  });

  if (!room) {
    return res.status(404).json({
      message: 'Room not found'
    });
  }

  // already enrolled check
  const alreadyBooked = await bookingsCollection.findOne({
    userId: roomData.userId,
    bookId: booksId
  });

  if (alreadyBooked) {
    return res.status(400).json({
      message: 'Already enrolled'
    });
  }

  // create booking
  const bookingResult = await bookingsCollection.insertOne({
    ...roomData,
    bookId: booksId,
    enrolledAt: new Date()
  });

  // increase enroll count
  await booksCollection.updateOne(
    { _id: new ObjectId(booksId) },
    {
      $inc: {
        enrollCount: 1
      }
    }
  );

  res.send({
    success: true,
    bookingResult
  });

});

app.post('/books',  async (req, res) => {
  const bookData = req.body;
  const result = await booksCollection.insertOne(bookData);
  res.send(result);
})

app.get('/books', async (req, res) => {
  const cursor = booksCollection.find();
  const result = await cursor.toArray();
  res.send(result);
});
 

app.put('/books/:id', async (req, res) => {
    const {id} = req.params;
    const updatedData = req.body;
    const result = await booksCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
    res.json(result);
}   );


// for delete
app.delete('/books/:booksId', verifyToken, async (req, res) => {
  const { booksId } = req.params;

  if (!ObjectId.isValid(booksId)) {
    return res.status(400).send({ message: 'Invalid Book ID' });
  }

  try {
  
    const booking = await bookingsCollection.findOne({
      bookId: booksId
    });

    if (!booking) {
      return res.status(404).send({
        message: 'Booking not found'
      });
    }

    const result = await bookingsCollection.deleteOne({
      bookId: booksId
    });

  
    await booksCollection.updateOne(
      { _id: new ObjectId(booksId) },
      { $inc: { enrollCount: -1 } }
    );

    res.send({
      success: true,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Delete Failed' });
  }
});

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
