"use strict";
require('dotenv').config()

const express = require('express')
const app = express()
const port = process.env.PRODUCTION ? process.env.PORT : 8080

const bodyparser = require('body-parser')

var server = require('http').createServer(app)

const mediaRouter = require('./routes/mediaRouter')

app.use(bodyparser.urlencoded({
    extended: true
}))
app.use(bodyparser.json())

app.use('/media', mediaRouter)

server.listen(port, () => {
    console.log(`StudioImageOps is listening on port ${port}!`)
});