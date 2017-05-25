'use strict';

const rqpr = require('request-promise-native');
const moment = require('moment');
const _ = require('lodash/fp');
const dynamodb = require('serverless-dynamodb-client');
const dynamoDoc = dynamodb.doc;
const jsonschema = require('jsonschema');
const aws = require('aws-sdk');
const lambda = new aws.Lambda();
const dynamoBackup = require('dynamo-backup-to-s3');

const userDataSchema = require('./userDataSchema.js').userDataSchema;

const usersTableName = 'users-' + process.env.SLS_STAGE;

function beeDateFormat(date) {
    return date.format("YYYY-MM-DD", date);
}

function setRoad(goalName, roadAll, token) {
    console.log("setting " + goalName);
    console.log(roadAll);
    let opts = {
        uri: 'https://www.beeminder.com/api/v1/users/me/goals/' + goalName + '.json',
        method: 'PUT',
        json: true,
        body: {
            'access_token': token,
            'roadall': roadAll
        }
    };
    if (roadAll.length === 0) {
        return Promise.reject("empty road");
    } else {
        for (let i = 1; i < roadAll.length; i++) {
            if (_.isEqual(roadAll[i], roadAll[i - 1])) {
                return Promise.reject("duplicate row: " + roadAll[i].toString());
            }
        }
        return rqpr(opts);
    }
}

function getGoalPromise(token, goalName) {
    return rqpr({
        uri: 'https://www.beeminder.com/api/v1/users/me/goals/' + goalName + '.json',
        qs: {'access_token': token},
        json: true});
}

function getUserInfoPromise(token) {
    if (process.env.IS_OFFLINE && token === "fakeToken") {
        return Promise.resolve(
            {goals:
             ["profitable","jobhunt","bedroom","survey","cycling","moonshot",
              "weeklyreview","reading"],
             username: "RonaldPUserman"});
    } else {
        return rqpr({
            uri: 'https://www.beeminder.com/api/v1/users/me.json',
            qs: {
                'access_token': token
            },
            json: true
        });
    }
}

function getRUnitMultiplier(goalInfo) {
    let res;
    switch (goalInfo.runits) {
        case 'y':
            res = 365.25;
            break;
        case 'm':
            res = 30;
            break;
        case 'w':
            res = 7;
            break;
        case 'd':
            res = 1;
            break;
        case 'h':
            res = 1 / 24;
            break;
    }
    return res;
}

function scheduleGoal(token, goalName, schedule) {
    console.log("scheduleGoal " + goalName + " " + schedule);
    let oneWeekOut = moment().utcOffset(-4).set({
        'hour': 12,
        'minute': 0,
        'second': 0,
        'millisecond': 0
    }).add(7, 'days');
    return getGoalPromise(token, goalName).then(goalInfo => {
        console.log(goalInfo);
        let rUnitMultiplier = getRUnitMultiplier(goalInfo);
        let truncatedRoad =
            goalInfo.roadall.map(x => [moment(x[0], "X"), x[1], x[2]])
            .filter(x => x[0] < oneWeekOut).map(
                x => [beeDateFormat(x[0]), x[1], x[2]]);
        let lastSegmentFull = goalInfo.fullroad[truncatedRoad.length];
        truncatedRoad.push([beeDateFormat(oneWeekOut), null, lastSegmentFull[2]]);
        let oneWeekOutDay = oneWeekOut.day();
        let newSegment = [];
        for (let i = 0; i < 7; i++) {
            let targetDate = oneWeekOut.clone();
            if (oneWeekOutDay < i) {
                targetDate.add(i - oneWeekOutDay, 'd');
            } else {
                targetDate.add(i - oneWeekOutDay + 7, 'd');
            }
            newSegment.push([beeDateFormat(targetDate), null, rUnitMultiplier * schedule[i]]);
        }
        newSegment.sort(); // this is done by comparing on string representations.
        console.log("New segment:");
        console.log(newSegment);
        let newRoadall = truncatedRoad.concat(newSegment);
        return setRoad(goalName, newRoadall, token);
    });
}

function jsonResponse(cb, status, data) {
    cb(null, {
        statusCode: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
    });
}

function putUserInfo(uinfo) {
    const validationResult = jsonschema.validate(uinfo, userDataSchema);
    if (validationResult.valid) {
        return dynamoDoc.put({
            TableName: usersTableName,
            Item: uinfo
        }).promise();
    } else {
        return Promise.reject(validationResult.errors);
    }
}

// This is called every time the frontend is loaded, and therefore after every
// new authorization. It's responsible for updating the token in the DB if it's
// changed.
module.exports.getGoalSlugs = ipBlockWrapper((event, context, cb) => {
    if (!event.queryStringParameters ||
        !event.queryStringParameters.access_token ||
        !event.queryStringParameters.username) {
        jsonResponse(cb, 400, "missing access_token or username param");
    } else {
        const access_token = event.queryStringParameters.access_token;
        const username = event.queryStringParameters.username;
        const logMsg = str => console.log(username + ": " + str);
        getUserInfoPromise(access_token)
            .then(
                (uinfo => {
                    if (username === uinfo.username) {
                        // If the username that Beeminder returns for the given token
                        // matches the username in our query string...
                        getStoredGoals(username).then(
                            ddbItem => {
                                if (ddbItem.token === access_token) {
                                    // Token doesn't need updating.
                                    logMsg("existing user");
                                    jsonResponse(cb, 200, uinfo.goals);
                                } else {
                                    // Token does need updating.
                                    ddbItem.token = access_token;
                                    putUserInfo(ddbItem).then(() => {
                                        logMsg("update token");
                                        jsonResponse(cb, 200, uinfo.goals);
                                    });
                                }
                            },
                            err => {
                                if (err.type === goalErrorTypes.noSuchUser) {
                                    putUserInfo({
                                        token: access_token,
                                        goals: {},
                                        name: username
                                    }).then(() => {
                                        logMsg("new user");
                                        jsonResponse(cb, 200, uinfo.goals);
                                    });
                                } else {
                                    logMsg("DDB error fetching");
                                    console.log(JSON.stringify(err));
                                    jsonResponse(cb, 500, "DynamoDB error");
                                }
                            });
                    } else {
                        jsonResponse(cb, 401, "passed username doesn't match token.");
                    }
                }),
                (err => {
                    if (err.statusCode === 401) {
                        jsonResponse(cb, 401, "Beeminder API returned 401");
                    } else {
                        console.log(err);
                        jsonResponse(cb, 500, "");
                    }
                }));
    }
});

const goalErrorTypes = {
    badDb: "invalid item in db",
    noSuchUser: "no such user"
};

function goalError(type, msg) {
    let ok = false;
    for (let ty of _.values(goalErrorTypes)) {
        if (type === ty) {
            ok = true;
            break;
        }
    }
    if (!ok) {
        throw "invalid goal error type!";
    } else {
        return {
            type: type,
            msg: msg
        };
    }
}

// Pull a user's goals out of the DB and validate it.
function getStoredGoals(username) {
    return dynamoDoc.get({
        TableName: usersTableName,
        Key: {
            name: username
        }
    }).promise().then(res => {
        if (_.isEqual(res, {})) {
            return Promise.reject(goalError(goalErrorTypes.noSuchUser, ""));
        } else {
            let validationResult =
                jsonschema.validate(res.Item, userDataSchema);
            if (validationResult.valid) {
                return Promise.resolve(res.Item);
            } else {
                return Promise.reject(
                    goalError(goalErrorTypes.badDb, validationResult.errors));
            }
        }
    });
}

module.exports.getStoredGoalsHTTP = ipBlockWrapper((event, context, cb) => {
    if (!event.queryStringParameters ||
        !event.queryStringParameters.username ||
        !event.queryStringParameters.token) {
        jsonResponse(cb, 400, {
            'error': 'missing username or token param'
        });
    } else {
        getStoredGoals(event.queryStringParameters.username)
            .then(
                val => {
                    if (val.token === event.queryStringParameters.token) {
                        jsonResponse(cb, 200, val);
                    } else {
                        jsonResponse(cb, 401, "Passed token doesn't match DDB");
                    }
                },
                fail => {
                    if (fail.type === goalErrorTypes.noSuchUser) {
                        jsonResponse(cb, 404, {});
                    } else {
                        jsonResponse(cb, 500, fail);
                    }
                });
    }
});

module.exports.setGoalSchedule = ipBlockWrapper((event, context, cb) => {
    try {
        const bodyParsed = JSON.parse(event.body);
        const validationResult = jsonschema.validate(bodyParsed, userDataSchema);
        const putUserInfoAndExit = () => putUserInfo(bodyParsed).then(
                dynamoDbRes => jsonResponse(cb, 200, "ok"),
                err => jsonResponse(cb, 500, err));

        const tokenValidatedInDDB = () =>
                  getStoredGoals(bodyParsed.name).then(
                      record => record.token === bodyParsed.token,
                      err => false);

        if (validationResult.valid) {
            // If the token sent matches our database, we can assume it's good.
            tokenValidatedInDDB().then(
                validated => {
                    if (validated) {
                        queueSetSched(bodyParsed.name).then(
                            () => putUserInfoAndExit());
                    } else {
                        jsonResponse(cb, 401, "token doesn't match database");
                    }
                }
            );
        } else {
            jsonResponse(cb, 400, validationResult.errors);
        }
    } catch (ex) {
        if (ex instanceof SyntaxError) {
            jsonResponse(cb, 400, "post body not valid JSON: " + ex.message);
        } else {
            throw ex;
        }
    }
});

// For a bug report against Firefox...

module.exports.jsonstring = (event, context, cb) => jsonResponse(cb, 200, "hello");

function setsched(username) {
    return getStoredGoals(username).then(
        res => {
            return Promise.all(_.map(ent => scheduleGoal(res.token, ent[0], ent[1]), _.toPairs(res.goals)));
        });
}

module.exports.setsched = (username, context, cb) => {
    if (typeof username === "string"){
        console.log("scheduling " + username);
        setsched(username).then(
            res => cb(null, res),
            err => {
                // FIXME: This should disable accounts with now-invalid
                // credentials.
                console.log(err);
                cb(err, null);
            });
    } else {
        cb("setsched got a non-string parameter!", null);
    }
};

const queueSetSched = uname => {
    console.log("queueing scheduling for: " + uname);
    if (process.env.IS_OFFLINE) {
        console.log("offline environment, not queueing async scheduling");
        return Promise.resolve("offline");
    } else {
        return lambda.invoke({
            FunctionName: 'beescheduler-' + process.env.SLS_STAGE + '-setsched',
            InvocationType: 'Event',
            Payload: JSON.stringify(uname)
        }).promise();
    }
};

module.exports.queueSetScheds = (evt, ctx, cb) => {
    dynamoDoc.scan({
        TableName: usersTableName,
        Select: "SPECIFIC_ATTRIBUTES",
        ProjectionExpression: "#n", // 'name' is a reserved word in DDB
        ExpressionAttributeNames: {'#n': 'name'}
    }).promise().then(
        res => {
            if (res.LastEvaluatedKey !== undefined) {
                cb("Scan needed more than 1 page of results! Echo, go implement this.", null);
            } else {
                Promise.all(_.map(item => queueSetSched(item.name), res.Items)).then(
                    res => cb(null, res),
                    err => cb(err, null));
            }
        }, err => cb(err, null));
};

module.exports.backupDDB = (evt, ctx, cb) => {
    console.log("Starting backup of " + usersTableName);
    let backup = new dynamoBackup({
        bucket: 'beescheduler-' + process.env.SLS_STAGE + '-ddb-backup',
        stopOnFailure: true,
        base64Binay: true
    });
    backup.on('error', data => {
        console.log('Error backing up!');
        console.log(JSON.stringify(data));
    });
    backup.on('end-backup', (tableName, backupDuration) => {
        console.log('Done backing up ' + tableName);
        console.log('Backup took ' + backupDuration.valueOf()/1000 + ' seconds.');
    });
    backup.backupTable(usersTableName, err => {
        if(err) {
            console.log("Backup error: " + err);
            cb(err, null);
        } else {
            console.log('Backup done!');
            cb(null, "");
        }
    });
};

const echosIP = "173.239.230.74";

// Take a HTTP request handler and wrap it such that requests to stages other
// than prod are blocked if they don't come from my IP address.
function ipBlockWrapper(func) {
    if (process.env.IS_OFFLINE || process.env.SLS_STAGE === "prod") {
        return func;
    } else {
        return (evt, ctx, cb) => {
            const incomingIp = evt.requestContext.identity.sourceIp;
            if (incomingIp === echosIP) {
                func(evt, ctx, cb);
            } else {
                jsonResponse(cb, 401, "request blocked by IP");
            }
        };
    }
}
