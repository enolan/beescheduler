'use strict';

const _ = require('lodash/fp');
const rqpr = require('request-promise-native');

module.exports.beeDateFormat = (date) => {
    return date.format("YYYY-MM-DD", date);
};

module.exports.setRoad = (goalName, roadAll, token) => {
    console.log("setting " + goalName);
    console.log(roadAll);
    let opts = {
        uri: 'https://www.beeminder.com/api/v1/users/me/goals/' + goalName + '.json',
        method: 'PUT',
        json: true,
        body: {
            'access_token': token,
            'roadall': normalizeRoad(roadAll)
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
};

function normalizeRoad(roadAll) {
    // Walk down the road, coalescing consecutive segments with the same rate.
    // Hopefully this will make it less error prone?

    const isTimeAndRate = (segment) =>
              segment[0] !== null && segment[2] !== null;

    // The first row is an initial date and value, it's always preserved.
    let out = [_.clone(roadAll[0])];

    for (let i = 1; i < roadAll.length; i++) {
        if (isTimeAndRate(roadAll[i]) && isTimeAndRate(out[out.length - 1])) {
            if (roadAll[i][2] === out[out.length - 1][2]) {
                console.log("extending segment: ", out[out.length - 1]);
                out[out.length - 1][0] = roadAll[i][0];
            } else {
                console.log("adding segment (1): ", roadAll[i]);
                out.push(_.clone(roadAll[i]));
            }
        } else {
            console.log("adding segment (2): ", roadAll[i]);
            out.push(_.clone(roadAll[i]));
        }
    }

    console.log("Normalized road:");
    console.log(out);
    return out;
}

module.exports.getGoal = (token, goalName) => {
    return rqpr({
        uri: 'https://www.beeminder.com/api/v1/users/me/goals/' + goalName + '.json',
        qs: {'access_token': token},
        json: true});
};

module.exports.getUserInfo = (token) => {
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
};

module.exports.getRUnitMultiplier = (goalInfo) => {
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
};
