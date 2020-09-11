'use strict';

const internals = {};

module.exports = [
    (joi) => ({
        type: /^/,
        prepare(params, { schema, state, prefs }) {

            let value = schema.$_getFlag('value');

            if (typeof value === 'undefined') {
                return;
            }

            if (joi.isRef(value) || joi.isExpression(value)) {
                value = value.resolve(params, state, prefs);
            }

            const errors = [];

            const result = internals.mapSchemaValues(joi, value, (s, path, parents) => {

                // https://github.com/sideway/joi/blob/f309431e17bce06c3d4e2ace35ed35cbabd01799/lib/types/keys.js#L107

                const localState = state.localize(
                    [...state.path, ...path],
                    [...parents, ...state.ancestors], // Ref support
                    {
                        key: path[path.length - 1], // Link support
                        schema: s
                    }
                );

                const validate = s.$_validate(params, localState, prefs);

                // TODO prefs.abortEarly

                if (validate.errors) {
                    errors.push(...validate.errors);
                }

                return validate.value;
            });

            return {
                value: result,
                // Quirk of coerce/prepare is that it bails early if errors is truthy,
                // which doesn't allow further validation to take place. This is a problem
                // in the case of Joi.number().value('2'), for example, as number()'s coercion
                // never takes place.
                errors: errors.length ? errors : null
            };
        },
        rules: {
            value: {
                method(value) {

                    return this.$_setFlag('value', value);
                }
            },
            param: {
                method(path, opts) {

                    return this.value(joi.ref(path, { ...opts, ancestor: 0 }));
                }
            }
        }
    }),
    (joi) => ({
        type: 'value',
        args(_, ...args) {

            return joi.any().value(...args);
        }
    }),
    (joi) => ({
        type: 'param',
        args(_, ...args) {

            return joi.any().param(...args);
        }
    })
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
