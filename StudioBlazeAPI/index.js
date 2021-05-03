const bodyParser = require("body-parser");
const request = require("request");
const sha1 = require("sha1");
const fs = require('fs');

var apiUrl = "";
var downloadUrl = "";
var authToken = "";

var minimumPartSize = -1;
var recommendedPartSize = -1;

module.exports = {
    authorizeAccout: async ({ keyID, key }) => {
        var auth = keyID + ":" + key;
        var authToken = `Basic ${Buffer.from(auth).toString('base64')}`;

        const options = {
            url: "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
            headers: {
                Authorization: authToken
            }
        };

        return new Promise((resolve, reject) => {
            request.get(options, function(error, response, body) {
                if (error) {
                    console.error(error);
                }
                if (response.statusCode !== 200) {
                    console.log("FAILED to authorize");
                    console.log(response.statusMessage);

                    return reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    body = JSON.parse(body);

                    apiUrl = body.apiUrl;
                    authToken = body.authorizationToken;
                    minimumPartSize = body.absoluteMinimumPartSize;
                    recommendedPartSize = body.recommendedPartSize;
                    downloadUrl = body.downloadUrl;

                    return resolve({
                        authorizationToken: authToken,
                        minimumPartSize,
                        recommendedPartSize
                    });
                }
            });
        });
    },
    getUploadUrl: async ({ authorizationToken, bucketId }) => {
        const options = {
            url: apiUrl + "/b2api/v2/b2_get_upload_url",
            headers: {
                Authorization: authorizationToken
            },
            body: JSON.stringify({
                bucketId
            }),
        };

        return new Promise((resolve, reject) => {
            request.post(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                if (response.statusCode !== 200) {
                    console.log("Failed to get upload URL!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);
    
                    return reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    body = JSON.parse(body);
    
                    return resolve({
                        authorizationToken: body.authorizationToken,
                        uploadUrl: body.uploadUrl
                    });
                }
            });
        });
    },
    uploadFile: async ({ authorizationToken, uploadUrl, fileName, data }) => {
        const options = {
            url: uploadUrl,
            headers: {
                "Authorization": authorizationToken,
                "X-Bz-File-Name": fileName,
                "Content-Type": "b2/x-auto",
                "Content-Length": data.length, // TODO
                "X-Bz-Content-Sha1": sha1(data)
            },
            body: data
        };

        //console.log(options);

        return new Promise((resolve, reject) => {
            request.post(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                if (response.statusCode !== 200) {
                    console.log("Failed to upload File to BackBlaze!");
                    
                    return reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    body = JSON.parse(body);

                    return resolve();
                }
            });
        });
    },
    startLargeFileUpload: async({ authorizationToken, bucketId, fileName }) => {
        const options = {
            url: `${apiUrl}/b2api/v2/b2_start_large_file`,
            headers: {
                Authorization: authorizationToken
            },
            body: JSON.stringify({
                bucketId: bucketId,
                fileName: fileName,
                contentType: "b2/x-auto" 
            })
        };

        return new Promise((resolve, reject) => {
            request.post(options, function (error, response, body) {
                if (error) {
                    console.log(error);
                }
                body = JSON.parse(body)
                if (response.statusCode !== 200) {
                    console.log("Failed to start large File Upload!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);

                    return reject(body);
                } else {
                    return resolve({
                        fileId: body.fileId,
                    });
                }
            });
        });
    },
    getUploadPartUrl: async ({ authorizationToken, fileId }) => {
        const options = {
            url: `${apiUrl}/b2api/v2/b2_get_upload_part_url`,
            headers: {
                Authorization: authorizationToken
            },
            body: JSON.stringify({
                fileId: fileId
            })
        };

        return new Promise((resolve, reject) => {
            request.post(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                body = JSON.parse(body)
                if (response.statusCode !== 200) {
                    console.log("Failed to get upload part url!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);

                    return reject(body);
                } else {
                    return resolve({
                        authorizationToken: body.authorizationToken,
                        uploadUrl: body.uploadUrl
                    });
                }
            });
        });
    },
    uploadPart: async ({ authorizationToken, partNumber, data, uploadUrl }) => {
        const options = {
            url: uploadUrl,
            headers: {
                "Authorization": authorizationToken,
                "X-Bz-Part-Number": partNumber,
                "Content-Length": data.length,
                "X-Bz-Content-Sha1": sha1(data)
            },
            body: data
        };

        return new Promise((resolve, reject) => {
            request.post(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                body = JSON.parse(body)
                if (response.statusCode !== 200) {
                    console.log("Failed to upload part!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);

                    return reject(body);
                } else {
                    return resolve({
                        status: "OK"
                    });
                }
            });
        })
    },
    finishLargeFile: async ({ authorizationToken, fileId, partSha1Array }) => {
        const options = {
            url: `${apiUrl}/b2api/v2/b2_finish_large_file`,
            headers: {
                Authorization: authorizationToken
            },
            body: JSON.stringify({
                fileId: fileId,
                partSha1Array: partSha1Array
            })
        };

        return new Promise((resolve, reject) => {
            request.post(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                body = JSON.parse(body);
                if(response.statusCode !== 200) {
                    console.log("Failed to finish large file upload!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);

                    return reject(body);
                } else {
                    console.log(body);
                }
            })
        });
    },
    downloadFile: async ({ authorizationToken, bucketName, fileName }) => {
        const options = {
            url:  downloadUrl + "/file/"  + bucketName + "/" + fileName,
            headers: {
                Authorization: authorizationToken
            }
        };

        //console.log(options);

        return new Promise((resolve, reject) => {
            request.get(options, function(error, response, body) {
                if (error) {
                    console.log(error);
                }
                /*if (response.statusCode !== 200) {
                    console.log("Failed to retrieve file from BackBlaze!");
                    console.log(response.statusCode);
                    console.log(response.statusMessage);

                    body = JSON.parse(body);
                    return reject(body);
                } else {
                    
                }*/
                console.log(body);
                return resolve();
            });
        });
    },
};