var fs = require('fs')

const ffmpegProbePath = require('@ffmpeg-installer/ffmpeg').path
const ffprobe = require('@ffprobe-installer/ffprobe')
const ffmpeg = require('fluent-ffmpeg')
ffmpeg.setFfprobePath(ffprobe.path)
ffmpeg.setFfmpegPath(ffmpegProbePath)

var request = require('request')

const helpers = require('./helpers')

async function processImage(processingEnv, fileName, tmpFile) {
    //console.log("Processing img/pdf")
    return new Promise((resolve, reject) => {
        var ext = fileName.split(".")[fileName.split(".").length - 1]
        //console.log(ext)
        if (ext.toLowerCase() == "pdf") {
            //console.log("tmp/ saved img/pdf")
        
            helpers.uploadToBackBlaze(tmpFile.path, fileName, processingEnv)
            .then(() => {
    
                //console.log("img/pdf upload to BackBlaze")
                return resolve({
                    status: 201,
                    message: "File uploaded to CDN"
                })
            })
            .catch((err) => {
                console.log("img/pdf Failed to upload to BackBlaze: ", err)
                return resolve({
                    status: 500,
                    message: "File Upload Failed",
                    error: err
                })
            })
        } else {
            const options = ext == "png" ? ["-v 5", "-pred mixed"] : ["-v 5"]

            ffmpeg(tmpFile.path).withOptions(options).output("tmp/" + fileName)
            .on('end', function(t) {
                //console.log("img/pdf compressed")
                fs.unlink(tmpFile.path, function(unerr) {
                    if (unerr) {
                        console.error(unerr)
                    }

                    //console.log("tmp/ saved img/pdf")
        
                    helpers.uploadToBackBlaze(fileName, fileName, processingEnv)
                    .then(() => {
            
                        //console.log("img/pdf upload to BackBlaze")
                        return resolve({
                            status: 201,
                            message: "File uploaded to CDN"
                        })
                    })
                    .catch((err) => {
                        console.log("img/pdf Failed to upload to BackBlaze: ", err)
                        return resolve({
                            status: 500,
                            message: "File Upload Failed",
                            error: err
                        })
                    })
                })
            })
            .run()
        }
    })
}

async function processVideo(processingEnv, fileName, tmpFile) {
    //console.log("Processing video")
    return new Promise((resolve, reject) => {
        if (tmpFile.originalname.substr(tmpFile.originalname.lastIndexOf(".") + 1) == "mov") {
            //console.log("Video is .mov")
            ffmpeg.ffprobe(tmpFile.path, function(err, metadata) {
                //console.log("Reading video details")
                if (err) {
                    console.log("FFPROBE Error: " + err)
                    fs.unlink(tmpFile.path, function(unerr) {
                        if (unerr) {
                            console.error(uerr)
                        }
                        return reject({
                            status: 500,
                            message: "FFProbe failed to read image metadata",
                            error: err
                        })
                    })
                }

                var videoCodec = null
                metadata.streams.forEach(function(stream) {
                    if (stream.codec_type === "video")
                        videoCodec = stream.codec_name
                })

                if (videoCodec != "h264") {
                    //console.log(`Video needs to be converted from '${videoCodec}' to h264`)
                    ffmpeg(tmpFile.path).withVideoCodec('libx264').withOption("-crf 23").withOption('-pix_fmt yuv420p').output("tmp/" + fileName)
                    .on('end', function(t) {
                        //console.log("Video converted")
                        fs.unlink(tmpFile.path, function(unerr) {
                            if (unerr) {
                                console.error(unerr)
                            }
                            //console.log("tmp/pre_ removed")
                            //console.log("Calling upload to backblaze for video")
                            helpers.uploadToBackBlaze(fileName, fileName, processingEnv)
                            .then(() => {
                                //console.log("Video uploaded to BackBlaze")
                                return resolve({
                                    status: 201,
                                    message: "File uploaded to CDN"
                                })
                            })
                            .catch((uerr) => {
                                console.log("Video Failed to upload to BackBlaze: ", uerr)
                                return reject({
                                    status: 500,
                                    message: "File Upload Failed",
                                    error: uerr
                                })
                            })
                        })
                    })
                    .run()
                } else {
                    //console.log("Compressing Video")
                    ffmpeg(tmpFile.path).withOption("-crf 23").output("tmp/" + fileName)
                    .on('end', function(t) {
                        //console.log("Video Compressed")
                        fs.unlink(tmpFile.path, function(unerr) {
                            if (unerr) {
                                console.error(unerr)
                            }
                            //console.log("Calling upload to backblaze for video")
                            helpers.uploadToBackBlaze(fileName, fileName, processingEnv)
                            .then(() => {
                                //console.log("Video uploaded to BackBlaze")
                                return resolve({
                                    status: 201,
                                    message: "File uploaded to CDN"
                                })
                            })
                            .catch((uerr) => {
                                console.log("Video Failed to upload to BackBlaze: ", uerr)
                                return reject({
                                    status: 500,
                                    message: "File Upload Failed",
                                    error: uerr
                                })
                            })
                        })
                    })
                    .run()
                }
            })
        } else {
            //console.log("Video is .mp4")
            //console.log("Compressing Video")
            ffmpeg(tmpFile.path).withOption("-crf 25").output("tmp/" + fileName)
            .on('end', function(t) {
                //console.log("Video Compressed")
                fs.unlink(tmpFile.path, function(unerr) {
                    if (unerr) {
                        console.error(unerr)
                    }
                    //console.log("tmp/ saved video")
                    helpers.uploadToBackBlaze(fileName, fileName, processingEnv)
                    .then(() => {
                        //console.log("Video uploaded to BackBlaze")
                        return resolve({
                            status: 201,
                            message: "File uploaded to CDN"
                        })
                    })
                    .catch((err) => {
                        console.log("Video Failed to upload to BackBlaze: ", err)
                        return reject({
                            status: 500,
                            message: "File Upload Failed",
                            error: err
                        })
                    })
                })
            })
            .run()
        }
    })
}

module.exports = {
    process: function(req, res) {
        var start = new Date()
        var hrstart = process.hrtime()

        var processingEnv = "production"
        var fileName = req.body.fileName
        var mediaBuffer = req.file
        var cbData = req.body.callbackData

        var oldAPI = false
        if (req.body.callbackData == 'null' || cbData === null) {
            oldAPI = true
        } else if (cbData.length == 0) {
            oldAPI = true
        }

        if (!oldAPI) {
            cbData = JSON.parse(cbData);
        }

        if (!oldAPI) {
            if (cbData.hasOwnProperty("delayResponse")) {
                if (!cbData.delayResponse) {
                    res.status(200).json({
                        status: 200,
                        message: 'File uploaded to proccessing server'
                    })
                }
            } else {
                res.status(200).json({
                    status: 200,
                    message: 'File uploaded to proccessing server'
                })
            }
        } else {
            res.status(200).json({
                status: 200,
                message: 'File uploaded to proccessing server'
            })
        }
        
        var splitFileName = fileName.split(".")
        var extension = splitFileName[splitFileName.length - 1]

        //console.log()
        //console.log("=================================START FILE PROCESS=================================")
        //console.log()
        //console.log(`Recieved File: ${fileName}`)

        if (extension.toLowerCase() == "mov" || extension.toLowerCase() == "mp4") {
            //console.log("File is a video")
            processVideo(processingEnv, fileName, mediaBuffer)
            .then((response) => {
                console.log(response)

                //console.log()
                //console.log("=================================END  FILE PROCESS=================================")
                //console.log()

                if (!oldAPI) {
                    if (cbData.hasOwnProperty("delayResponse")) {
                        if (!cbData.delayResponse) {
                            request.post(cbData.cbUrl, {
                                form: {
                                    campaignId: cbData.campaignId,
                                    userId: cbData.creatorId,
                                    uploadedFileName: fileName,
        
                                    uploadStatus: response.status,
                                    uploadMessage: response.message
                                }
                            }, function(pError, pResponse, pBody) {
                                var end = new Date() - start
                                var hrend = process.hrtime(hrstart)
                                
                                console.info('Execution time: %dms', end)
                                console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                            })
                        } else {
                            res.status(200).json({
                                status: 200,
                                message: 'File uploaded to proccessing server'
                            })
                        }
                    } else {
                        request.post(cbData.cbUrl, {
                            form: {
                                campaignId: cbData.campaignId,
                                userId: cbData.creatorId,
                                uploadedFileName: fileName,
    
                                uploadStatus: response.status,
                                uploadMessage: response.message
                            }
                        }, function(pError, pResponse, pBody) {
                            var end = new Date() - start
                            var hrend = process.hrtime(hrstart)
                            
                            console.info('Execution time: %dms', end)
                            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                        })
                    }
                }
            })
            .catch((err) => {
                console.log(err)

                //console.log()
                //console.log("=================================END  FILE PROCESS=================================")
                //console.log()

                if (!oldAPI) {
                    if (cbData.hasOwnProperty("delayResponse")) {
                        if (!cbData.delayResponse) {
                            request.post(cbData.cbUrl, {
                                form: {
                                    campaignId: cbData.campaignId,
                                    userId: cbData.creatorId,
                                    uploadedFileName: fileName,
        
                                    uploadStatus: 500,
                                    uploadMessage: "File Upload Failed",
                                    uploadError: err
                                }
                            }, function(pError, pResponse, pBody) {
                                var end = new Date() - start
                                var hrend = process.hrtime(hrstart)
                                
                                console.info('Execution time: %dms', end)
                                console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                            })
                        } else {
                            res.send(500).json({
                                uploadStatus: 500,
                                uploadMessage: "File Upload Failed",
                                uploadError: err
                            })
                        }
                    } else {
                        request.post(cbData.cbUrl, {
                            form: {
                                campaignId: cbData.campaignId,
                                userId: cbData.creatorId,
                                uploadedFileName: fileName,
    
                                uploadStatus: 500,
                                uploadMessage: "File Upload Failed",
                                uploadError: err
                            }
                        }, function(pError, pResponse, pBody) {
                            var end = new Date() - start
                            var hrend = process.hrtime(hrstart)
                            
                            console.info('Execution time: %dms', end)
                            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                        })
                    }
                }
            })
        } else {
            //console.log("File is an image/pdf")
            processImage(processingEnv, fileName, mediaBuffer)
            .then((response) => {
                console.log(response)

                //console.log()
                //console.log("=================================END  FILE PROCESS=================================")
                //console.log()

                if (!oldAPI) {
                    if (cbData.hasOwnProperty("delayResponse")) {
                        if (!cbData.delayResponse) {
                            request.post(cbData.cbUrl, {
                                form: {
                                    campaignId: cbData.campaignId,
                                    userId: cbData.creatorId,
                                    uploadedFileName: fileName,
            
                                    uploadStatus: response.status,
                                    uploadMessage: response.message
                                }
                            }, function(pError, pResponse, pBody) {
                                var end = new Date() - start
                                var hrend = process.hrtime(hrstart)
                                
                                console.info('Execution time: %dms', end)
                                console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                            })
                        } else {
                            res.status(200).json({
                                status: 200,
                                message: 'File uploaded to proccessing server'
                            })
                        }
                    } else {
                        request.post(cbData.cbUrl, {
                            form: {
                                campaignId: cbData.campaignId,
                                userId: cbData.creatorId,
                                uploadedFileName: fileName,
        
                                uploadStatus: response.status,
                                uploadMessage: response.message
                            }
                        }, function(pError, pResponse, pBody) {
                            var end = new Date() - start
                            var hrend = process.hrtime(hrstart)
                            
                            console.info('Execution time: %dms', end)
                            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                        })
                    }
                }
            })
            .catch((err) => {
                console.log(err)

                if (!oldAPI) {
                    if (cbData.hasOwnProperty("delayResponse")) {
                        if (!cbData.delayResponse) {
                            request.post(cbData.cbUrl, {
                                form: {
                                    campaignId: cbData.campaignId,
                                    userId: cbData.creatorId,
                                    uploadedFileName: fileName,
        
                                    uploadStatus: 500,
                                    uploadMessage: "File Upload Failed",
                                    uploadError: err
                                }
                            }, function(pError, pResponse, pBody) {
                                var end = new Date() - start
                                var hrend = process.hrtime(hrstart)
                                
                                console.info('Execution time: %dms', end)
                                console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                            })
                        } else {
                            res.send(500).json({
                                uploadStatus: 500,
                                uploadMessage: "File Upload Failed",
                                uploadError: err
                            })
                        }
                    } else {
                        request.post(cbData.cbUrl, {
                            form: {
                                campaignId: cbData.campaignId,
                                userId: cbData.creatorId,
                                uploadedFileName: fileName,
    
                                uploadStatus: 500,
                                uploadMessage: "File Upload Failed",
                                uploadError: err
                            }
                        }, function(pError, pResponse, pBody) {
                            var end = new Date() - start
                            var hrend = process.hrtime(hrstart)
                            
                            console.info('Execution time: %dms', end)
                            console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                        })
                    }
                }
            })
        }
    }
}
