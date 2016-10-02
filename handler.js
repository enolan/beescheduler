'use strict';

const beeminder = require('beeminder');
const prefs = { token: "vUdVJG732t9toR7kebFW"};

module.exports.setsched = (event, context, cb) => {
    cb(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};

// You can add more handlers here, and reference them in serverless.yml
