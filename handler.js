'use strict';

const beeminder = require('beeminder');
const rqpr = require('request-promise-native');
const moment = require('moment');
const _ = require('lodash/fp');

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
            newSegment.push([beeDateFormat(targetDate), null, schedule[i]]);
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
    profitable: [0, 7, 7, 6, 0, 0, 0],
    survey:   [0, 0, 0, 0, 8, 2, 0],
    moonshot: [0, 0, 0, 0, 0, 5, 0]
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

// You can add more handlers here, and reference them in serverless.yml
