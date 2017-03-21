"use strict";

module.exports = {};

module.exports.userDataSchema = {
    type: "object",
    id: "http://echonolan.net/beescheduler-schema",
    properties: {
        token: {
            type: "string"
        },
        goals: {
            type: "object",
            additionalProperties: {
                type: "array",
                items: {
                    type: "number"
                },
                minItems: 7,
                maxItems: 7
            }
        },
        name: {
            type: "string"
        }
    },
    additionalProperties: false,
    required: ["name", "token", "goals"]
};
