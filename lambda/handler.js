'use strict';

const beeminder = require('beeminder');
const rqpr = require('request-promise-native');
const moment = require('moment');
const _ = require('lodash/fp');
const querystring = require('querystring');
const dynamodb = require('serverless-dynamodb-client');
const dynamoDoc = dynamodb.doc;
const jsonschema = require('jsonschema');

const userDataSchema = require('./userDataSchema.js').userDataSchema;

const token = "wF7Lo63rZv8qSHxbL-kh";

function beeDateFormat(date) {
    return date.format("YYYY-MM-DD", date);
}

function setRoad(goalName, roadAll) {
    console.log("setting " + goalName);
    console.log(roadAll);
    let opts = {
        uri: 'https://www.beeminder.com/api/v1/users/enolan/goals/' + goalName + '.json',
        method: 'PUT',
        json: true,
        body: {
            'auth_token': token,
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

function getGoalPromise(bm, goalName) {
    return new Promise((resolve, reject) => {
        bm.getGoal(goalName, function(err, res) {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

function getUserInfoPromise(token) {
    if (process.env.IS_OFFLINE && token === "fakeToken") {
        return Promise.resolve(
            {goals:
             ["profitable","jobhunt","bedroom","survey","cycling","moonshot",
              "weeklyreview","reading"]});
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

function scheduleGoal(bm, goalName, schedule) {
    console.log("scheduleGoal " + goalName + " " + schedule);
    let oneWeekOut = moment().utcOffset(-4).set({
        'hour': 12,
        'minute': 0,
        'second': 0,
        'millisecond': 0
    }).add(7, 'days');
    return getGoalPromise(bm, goalName).then(goalInfo => {
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
        return setRoad(goalName, newRoadall);
    });
}
// Sunday, Monday...

const sched = {
    //    idris:    [0, 7, 7, 6, 0, 0, 0],
    profitable: [0, 5, 5, 5, 0, 0, 0],
    survey:     [0, 0, 0, 0, 5, 1, 0],
    moonshot:   [0, 0, 0, 0, 0, 4, 0]
};
// const sched = {
//     test: [1, 2, 5, 0, 9, 0.3, 4],
//     testb: [5, 4, 11, 3, 8, 0, 2],
//     testc: [0, 0, 0, 6, 0, 0, 2]

// };

module.exports.setsched = (event, context, cb) => {
    let bm = beeminder(token);
    console.log(sched);
    Promise.all(_.map(ent => scheduleGoal(bm, ent[0], ent[1]), _.toPairs(sched))).then(
        val => {
            cb(null, val);
        },
        err => {
            cb(err, null);
        });
};

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

module.exports.getGoalSlugs = (event, context, cb) => {
    if (!event.queryStringParameters ||
        !event.queryStringParameters.access_token) {
        jsonResponse(cb, 400, {
            'error': 'missing access_token param'
        });
        return;
    } else {
        getUserInfoPromise(event.queryStringParameters.access_token)
            .then(
                (uinfo => {
                    jsonResponse(cb, 200, uinfo.goals);
                }),
                (err => {
                    if (err.statusCode === 401) {
                        jsonResponse(cb, 401, "Beeminder API returned 401");
                    } else {
                        console.log(err);
                        jsonResponse(cb, 500, "");
                    }
                }));
        return;
    }
};

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
        TableName: 'users',
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

module.exports.getStoredGoalsHTTP = (event, context, cb) => {
    if (!event.queryStringParameters ||
        !event.queryStringParameters.username ||
        !event.queryStringParameters.token) {
        jsonResponse(cb, 400, {
            'error': 'missing username or token param'
        });
    } else {
        getStoredGoals(
            event.queryStringParameters.username,
            event.queryStringParameters.token)
            .then(
                val => {
                    if (val.token === event.queryStringParameters.token) {
                        jsonResponse(cb, 200, val);
                    } else {
                        jsonResponse(cb, 401, {});
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
};

module.exports.setGoalSchedule = (event, context, cb) => {
    try {
        const bodyParsed = JSON.parse(event.body);
        const validationResult = jsonschema.validate(bodyParsed, userDataSchema);
        const putUserInfo = () => dynamoDoc.put(
            {TableName: 'users',
             Item: bodyParsed
            }).promise().then(
                dynamoDbRes => jsonResponse(cb, 200, "ok"),
                err => jsonResponse(cb, 500, "DynamoDB error"));

        const tokenValidatedInDDB = () =>
                  getStoredGoals(bodyParsed.name).then(
                      record => record.token === bodyParsed.token,
                      err => false);

        if (validationResult.valid) {
            // If the token sent matches our database, we can assume it's good.
            tokenValidatedInDDB().then(
                validated => {
                    if (validated) {
                        return putUserInfo();
                    } else {
                        // They might've sent a token that is valid for their
                        // account but is different from the one we have stored.
                        return getUserInfoPromise(bodyParsed.token).then(
                            uinfo => {
                                if (uinfo.username === bodyParsed.name) {
                                    return putUserInfo();
                                } else {
                                    jsonResponse(cb, 401, "Username returned by Beeminder doesn't match passed");
                                    return null; // Get jshint to chill.
                                }
                            },
                            err => {
                                if (err.statusCode === 401) {
                                    jsonResponse(cb, 401, "Beeminder API returned 401");
                                } else {
                                    jsonResponse(cb, 500, "Beeminder API error in getUserInfoPromise");
                                }
                            });
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
};

// For a bug report against Firefox...

module.exports.jsonstring = (event, context, cb) => jsonResponse(cb, 200, "hello");
