'use strict';

const beeminder = require('beeminder');
const rqpr = require('request-promise-native');
const strftime = require('strftime');
const _ = require('lodash/fp');

const token = "wF7Lo63rZv8qSHxbL-kh";

function addDate(date, days) {
    let res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
}

function beeDateFormat(date) {
    return strftime("%Y-%m-%d", date);
}

function setRoad(goalName, roadAll) {
    console.log("setRoad " + goalName);
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
    console.log(opts);
    return rqpr(opts);
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

function scheduleGoal(bm, goalName, schedule) {
    console.log("scheduleGoal " + goalName + " " + schedule);
    let oneWeekOut = addDate(Date.now(), 7);
    return getGoalPromise(bm, goalName).then(goalInfo => {
        console.log(goalInfo);
        let truncatedRoad =
            goalInfo.roadall.filter(x => new Date(x[0] * 1000) < oneWeekOut).map(
                x => [beeDateFormat(new Date(x[0] * 1000)), x[1], x[2]]);
        let lastSegmentFull = goalInfo.fullroad[truncatedRoad.length];
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
            newSegment.push([beeDateFormat(targetDate), null, schedule[i]]);
        }
        newSegment.sort(); // this is done by comparing on string representations.
        let newRoadall = truncatedRoad.concat(newSegment);
        console.log(newRoadall);
        return setRoad(goalName, newRoadall);
    });
}
// Sunday, Monday...

const sched = {
    test: [0, 0, 0, 0, 0, 20, 0],
    testb: [1, 10, 1, 5, 1, 0, 4],
    testc: [12, 2, 11, 0.3, 1, 5, 0]
};

module.exports.setsched = (event, context, cb) => {
    let bm = beeminder(token);
    console.log("setsched");
    console.log(sched);
    Promise.all(_.map(ent => scheduleGoal(bm, ent[0], ent[1]), _.toPairs(sched))).then(
        val => {
            cb(null, val);
        },
        err => {
            cb(err, null);
        });
};

// You can add more handlers here, and reference them in serverless.yml
