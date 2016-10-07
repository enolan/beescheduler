'use strict';

const beeminder = require('beeminder');
const request = require('request');
const strftime = require('strftime');

const token = "wF7Lo63rZv8qSHxbL-kh";

function addDate(date, days) {
    let res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
}

function beeDateFormat(date) {
    return strftime("%Y-%m-%d", date);
}

function setRoad(roadAll, cb) {
    let options = {
        uri: 'https://www.beeminder.com/api/v1/users/enolan/goals/test.json',
        method: 'PUT',
        json: true,
        body: {
            'auth_token': token,
            'roadall': roadAll
        }
    };
    request(options, cb);
}

// Sunday, Monday...

const sched = [0, 7, 7, 6, 0, 0, 0];

module.exports.setsched = (event, context, cb) => {
        let bm = beeminder(token);
        let oneWeekOut = addDate(Date.now(), 7);
        bm.getGoal('test', function(err, res) {
                if (err) {
                    cb(JSON.stringify(err), null);
                } else {
                    console.log(res);
                    let truncatedRoad =
                        res.roadall.filter(x => new Date(x[0] * 1000) < oneWeekOut).map(
                            x => [beeDateFormat(new Date(x[0] * 1000)), x[1], x[2]]);
                    let lastSegmentFull = res.fullroad[truncatedRoad.length];
                    truncatedRoad.push([beeDateFormat(oneWeekOut), null, lastSegmentFull[2]]);
                    let oneWeekOutDay = oneWeekOut.getDay();
                    let newSegment = [];
                    for (let i = 0; i < 7; i++) {
                        let targetDate;
                        if (oneWeekOutDay < i) {
                            targetDate = addDate(oneWeekOut, i - oneWeekOutDay);
                        } else {
                            targetDate = addDate(oneWeekOut, i - oneWeekOutDay + 7);
                        }
                        newSegment.push([beeDateFormat(targetDate), null, sched[i]]);
                    }
                    newSegment.sort(); // this is done by comparing on string representations.
                    let newRoadall = truncatedRoad.concat(newSegment);
                    setRoad(newRoadall, function (err, msg, body) {
                                if (err) {
                                    cb(err, null);
                                } else if (body) {
                                    cb(null, body);
                                }});
                    }
                });
        };

// You can add more handlers here, and reference them in serverless.yml
