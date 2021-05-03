const { spawn } = require('child_process')
const fs = require('fs')

const sha1 = require('sha1')

const bb2API = require("../StudioBlazeAPI");

async function uploadPart(authorizationToken, fileId, partNumber, part) {
    //console.log(`Uploading ${fileId} part: ${partNumber}`)
    return new Promise((resolve, reject) => {
        //console.log("Getting part url")
        bb2API.getUploadPartUrl({ authorizationToken: authorizationToken, fileId: fileId })
        .then(async (response) => {
            //console.log("Part url retrieved")
            var uploadUrl = response.uploadUrl;
            var authToken = response.authorizationToken;

            //console.log(`Sending ${fileId} part: ${partNumber} to BackBlaze for upload`)
            b2.uploadPart({
                partNumber,
                uploadUrl,
                uploadAuthToken: authToken,
                data: part
            })
            .then(() => {
                console.log(`${fileId} part:${partNumber} successfully uploaded to BackBlaze`)
                return resolve()
            })
            .catch((uperr) => {
                console.log("-- Failed to upload part to BackBlazeB2")
                console.log(uperr)
                return reject(uperr)
            })
        })
        .catch((err) => {
            console.log("-- Failed to get BackBlazeB2 uploadPartUrl")
            console.log(err)
            return reject(err)
        })
    })
}

async function uploadParts(authorizationToken, fileId, parts) {
    //console.log("setting up upload part promises")
    const uploads = [];

    for (var i = 0; i < parts.length; i++) {
        //console.log(`Promissing ${fileId}:${i + 1}`)
        uploads.push(uploadPart(authorizationToken, fileId, i + 1, parts[i]));
    }

    //console.log("All parts promised")
    return Promise.all(uploads)
}

async function uploadLargeFile(authorizationToken, fileName, desiredFileName, fileData, fileSizeInBytes, recommendedPartSize, processingEnv) {
    //console.log(`Uploading ${fileName} in byte parts of ${recommendedPartSize} as ${desiredFileName}`)
    return new Promise((resolve, reject) => {
        //console.log("Getting file stats and size for parts upload")
        /*var file = fs.readFileSync("tmp/" + fileName)
        var stats = fs.statSync("tmp/" + fileName)
        var fileSizeInBytes = stats.size*/

        var bucketId = process.env.BACKBLAZE_BUCKET_ID
        //console.log("start large file upload to BackBlaze")
        bb2API.startLargeFileUpload({ authorizationToken, bucketId, fileName: desiredFileName })
        .then((res) => {
            //console.log("BackBlaze returned the ok to upload parts")
            var fileId = res.fileId

            //console.log(`Splitting large file: ${fileName} into ${recommendedPartSize} byte parts`)
            var parts = []
            for (var start = 0; start < fileSizeInBytes; start += recommendedPartSize) {
                var block = fileData.slice(start, start + recommendedPartSize)
                parts.push(block)
            }
            //console.log("Parts allocated")

            //console.log("Sending parts to upload function allocator")
            uploadParts(authorizationToken, fileId, parts)
            .then(() => {
                //console.log("All parts uploaded successfully")
                //console.log("Inform BackBlaze file upload is complete")
                bb2API.finishLargeFile({
                    authorizationToken,
                    fileId,
                    partSha1Array: parts.map(part => sha1(part)) 
                })
                .then(() => {
                    //console.log("BackBlaze understood")
                    return resolve()
                })
                .catch((ferr) => {
                    console.log("-- Failed to finish BackBlazeB2 multipartUpload")
                    console.log(ferr)
                    return reject(ferr)
                })
            })
            .catch((perr) => {
                console.log("-- UploadParts failed to upload large File!")
                console.log(perr)
                return reject(perr)
            })
        })
        .catch((err) => {
            console.log("-- Failed to start BackBlazeB2 multipartUpload")
            console.log(err)
            return reject(err)
        })
    })
}

module.exports = {
    addTikTokData: (filePath) => {
        //console.log(`Adding TikTok exif tags to ${filePath}`)
        filePath = "tmp/" + filePath
        return new Promise((resolve, reject) => {
            //console.log("exiftool call")
            // -TikTok:Program=\"TCPP\" -TikTok:PartnerAssetID=\"98v0q8b0\"  
            const exif = spawn(
                "exiftool",
                [
                    "-config",
                    "utils/TikTokConfig.cfg",
                    "-TikTok:Version=0.1",
                    "-TikTok:PartnerBusinessCenterID=1670955669907461",
                    "-TikTok:PartnerAPPID=6920622271933448194",
                    "-overwrite_original",
                    filePath
                ]
            )

            exif.stderr.on('data', (data) => {
                console.log(`error: ${data}`)
                return reject(data)
            })

            exif.on('close', (code) => {
                //console.log(`Child process exited with code: ${code}`)
                //console.log("TikTok tags success")
                return resolve()
            })
        })
    },
    uploadToBackBlaze: (fileName, desiredFileName, processingEnv) => {
        console.log(`${fileName} is being uploaded to backblaze(${processingEnv}) as '${desiredFileName}'`)
        return new Promise((resolve, reject) => {
            //console.log("Add TikTokTags call")
            module.exports.addTikTokData(fileName)
            .then(() => {
                //console.log("TikTok tags were added")

                //console.log("Reading file data and stats from tmp/")
                fs.readFile("tmp/" + fileName, function(rerr, fileRead) {
                    if (rerr) {
                        console.error("Failed to read file!", rerr)
                    }

                    const file = fileRead;

                    fs.stat("tmp/" + fileName, function(sterr, statsRead) {
                        if (sterr) {
                            console.error("Failed to read file stats", sterr)
                        }

                        const stats = statsRead;
    
                        var fileSizeInBytes = stats.size
                        //console.log(`File size in bytes: ${fileSizeInBytes}`)
        
                        try {
                            //console.log("Authorizing BackBlaze")
                            bb2API.authorizeAccout({ keyID: process.env.BACKBLAZE_KEY_ID, key: process.env.BACKBLAZE_KEY })
                            .then((authResponse) => {
                                //console.log("BackBlaze authorized")
                                var bucketId = process.env.BACKBLAZE_BUCKET_ID
                                //console.log(`Getting backblaze upload url for bucket: ${bucketId}`)
                                bb2API.getUploadUrl({ authorizationToken: authResponse.authorizationToken, bucketId })
                                .then((response) => {
                                    //console.log("Retrieved upload url for BackBlaze")
                                    if (response) {
                                        var token = response.authorizationToken
                                        var uploadURL = response.uploadUrl
        
                                        var partSize = (authResponse.recommendedPartSize / 8) * 4
                                        //console.log(`Recommended part size: ${partSize}`)
                                        
                                        if (fileSizeInBytes > partSize) {
                                            //console.log("File will be uploaded in parts")
                                            uploadLargeFile(fileName, desiredFileName, file, fileSizeInBytes, partSize, processingEnv)
                                            .then(() => {
                                                //console.log("File successfully uploaded in parts")
                                                fs.unlink("tmp/" + fileName, function(unerr) {
                                                    if (unerr) {
                                                        console.error("Failed to delete file! ", unerr)
                                                    }
        
                                                    return resolve()
                                                })
                                            })
                                            .catch((uerr) => {
                                                console.log("-- Failed to upload file to BackBlaze B2 Bucket!")
                                                console.log(uerr)
            
                                                fs.unlink("tmp/" + fileName, function(unerr) {
                                                    if (unerr) {
                                                        console.error("Failed to delete file! ", unerr)
                                                    }
        
                                                    return reject("Failed to upload file to CDN!")
                                                })
                                            })
                                        } else {
                                            try {
                                                console.log("Uploading file in one go")
                                                bb2API.uploadFile({
                                                    authorizationToken: token,
                                                    uploadUrl: uploadURL,
                                                    fileName: desiredFileName,
                                                    data: file
                                                })
                                                .then((result) => {
                                                    //console.log("File uploaded in one call success")
                                                    fs.unlink("tmp/" + fileName, function(unerr) {
                                                        if (unerr) {
                                                            console.error("Failed to delete file! ", unerr)
                                                        }
                                                        
                                                        return resolve()
                                                    })
                                                })
                                                .catch((errr) => {
                                                    console.log("File failed to upload to BackBlaze in one call: ", errr)
                                                    return reject("CDN upload failed!")
                                                })
                                            } catch (uerr) {
                                                console.log("-- Failed to upload file to BackBlaze B2 Bucket!")
                                                console.log(uerr)
            
                                                fs.unlink("tmp/" + fileName, function(unerr) {
                                                    if (unerr) {
                                                        console.error("Failed to delete file! ", unerr)
                                                    }
        
                                                    return reject("Failed to upload file to CDN!")
                                                })
                                            }
                                        }
                                    }
                                })
                                .catch((err) => {
                                    console.log(err)
                                    return reject("No upload url")
                                })
                            })
                            .catch((err) => {
                                console.log(err)
                                return reject("Failed authorize BB2")
                            })
                        } catch (err) {
                            console.log("-- BackBlaze B2 authorization failed!")
                            console.log(err)
        
                            fs.unlink("tmp/" + fileName, function(unerr) {
                                if (unerr) {
                                    console.error("Failed to delete file! ", unerr)
                                }
            
                                return reject("Error authorizing CDN")
                            })
                        }
                    })
                })
            })
            .catch((err) => {
                console.log("-- Failed to add TikTok tags")
                console.log(err)

                fs.unlink("tmp/" + fileName, function(unerr) {
                    if (unerr) {
                        console.error("Failed to delete file! ", unerr)
                    }

                    return reject("Failed to add TikTok tags!")
                })
            })
        })
    }
}