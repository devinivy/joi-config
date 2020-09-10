'use strict';

const Hoek = require('@hapi/hoek');

const internals = {};

module.exports = [
    (joi) => ({
        type: 'value',
        args(schema, val) {

            return schema.$_setFlag('configValue', val);
        },
        coerce(params, { schema, state, prefs }) {

            const configValue = schema.$_getFlag('configValue');
            const errors = [];

            const result = internals.mapSchemaValues(joi, configValue, (s, path, parents) => {

                // https://github.com/sideway/joi/blob/f309431e17bce06c3d4e2ace35ed35cbabd01799/lib/types/keys.js#L107

                const localState = state.localize(
                    [...state.path, ...path],
                    [...parents, ...state.ancestors], // Ref support
                    {
                        key: path[path.length - 1], // Link support
                        schema: s
                    }
                );

                const result = s.$_validate(params, localState, prefs);

                // TODO prefs.abortEarly

                if (result.errors) {
                    errors.push(...result.errors);
                }

                return result.value;
            });

            return {
                value: result,
                errors
            };
        }
    }),
    {   // Consider making param a subtype of value, implementing all the goods on value
        type: 'param',
        args(schema, val) {

            return schema.$_setFlag('configParam', val.split('.'));
        },
        coerce(params, { schema }) {

            return {
                value: Hoek.reach(params, schema.$_getFlag('configParam'))
            };
        }
    }
];

internals.mapSchemaValues = (joi, obj, fn, path = [], parents = []) => {

    if (Array.isArray(obj)) {
        const arr = [];
        obj.forEach((value, i) => {

            arr.push(
                internals.mapSchemaValues(joi, value, fn, [...path, i], [arr, ...parents])
            );
        });
        return arr;
    }

    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    if (joi.isSchema(obj)) {
        return fn(obj, path, parents);
    }

    const o = {};
    Object.entries(obj).forEach(([key, value]) => {

        o[key] = internals.mapSchemaValues(joi, value, fn, [...path, key], [o, ...parents]);
    });
    return o;
};
