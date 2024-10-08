const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000


const corsOptions = {
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://eddoxhub.web.app',
    ],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())



const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    //console.log(token)
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}

// mongo db url
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q3baw43.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})

async function run() {
    try {
        const db = client.db('eddoxhubDB')
        const usersCollection = db.collection('users')
        const productsCollection = db.collection('products')



        // verify Admin
        const verifyAdmin = async (req, res, next) => {
            console.log('hello from admin')
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            console.log(result?.role)
            if (!result || result?.role !== 'admin')
                return res.status(401).send({ message: 'unauthorized access!!' })
            next()
        }


        // verify user
        const verifyUser = async (req, res, next) => {
            console.log('hello from User')
            const user = req.user
            const query = { email: user?.email }
            const result = await usersCollection.findOne(query)
            console.log(result?.role)
            if (!result || result?.role !== 'user') {
                return res.status(401).send({ message: 'unauthorized access!!' })
            }

            next()
        }




        // auth related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })

        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })



        // TODO: User DB
        // save a user data in db
        app.put('/user', async (req, res) => {
            const user = req.body

            const query = { email: user?.email }
            // check if user already exists in db

            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                    // if existing user login again
                    return res.send(isExist)
            }

            // save user for the first time
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timestamp: Date.now(),
                },
            }
            console.log(updateDoc)
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
        })

        // get a user info by email from db
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })


        // get all users data from db
        app.get('/users', verifyToken, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })


        //update a user role
        app.patch('/users/update/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email }
            const updateDoc = {
                $set: { ...user, timestamp: Date.now() },
            }
            console.log(updateDoc)
            const result = await usersCollection.updateOne(query, updateDoc)
            res.send(result)
        })


        // TODO: Products APIS
        // Get all Products
        app.get('/products', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 15;
                const skip = (page - 1) * limit;

                const brand = req.query.brand || "";
                const category = req.query.category || "";
                const minPrice = parseFloat(req.query.minPrice) || 0;
                const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
                const searchQuery = req.query.searchQuery || "";
                const priceSort = req.query.priceSort || ""; // "asc" or "desc"
                const dateSort = req.query.dateSort || ""; // "asc" or "desc"

                // Build the filter object
                const filter = {};
                if (brand) {
                    filter.brand = brand; // Add brand filter if provided
                }
                if (category) {
                    filter.category = category; // Add category filter if provided
                }
                if (minPrice || maxPrice) {
                    filter.price = { $gte: minPrice, $lte: maxPrice }; // Add price range filter if provided
                }
                if (searchQuery) {
                    filter.name = { $regex: searchQuery, $options: "i" }; // Add search filter if provided
                }

                // Build the sort object
                const sort = {};
                if (priceSort) {
                    sort.price = priceSort === "asc" ? 1 : -1; // Sort by price
                }
                if (dateSort) {
                    sort.date = dateSort === "asc" ? 1 : -1; // Sort by date
                }

                const totalProducts = await productsCollection.countDocuments(filter); // Count based on filter
                const totalPages = Math.ceil(totalProducts / limit);

                const products = await productsCollection
                    .find(filter) // Apply the filter
                    .sort(sort) // Apply the sorting
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                res.send({
                    products,
                    totalPages,
                });
            } catch (error) {
                console.error('Error fetching Products:', error);
                res.status(500).send('Error fetching Products');
            }
        });

        // get specific product
        app.get('/product/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await productsCollection.findOne(query)
            res.send(result)
        })




        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 })
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Eddox Hub Server is Running...')
})


app.listen(port, () => {
    console.log(`Eddox Hub Server is Running on port ${port}`)
})
