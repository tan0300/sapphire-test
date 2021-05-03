const express = require('express')
const router = express.Router()
const controller = require('../controllers/media')
const multer = require('multer')
var path = require('path')

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './tmp/upload')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)) //Appending extension
    } 
});

const upload = multer({ storage: storage });

router.post("/process", upload.single('file'), controller.process);

module.exports = router