'use strict';

const internals = {};

module.exports = [
    (joi) => ({
        type: 'paramRef',
        args(_, path, opts) {

            return joi.ref(path, { ...opts, ancestor: 0 });
        }
    }),
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

            let result = internals.mapSchemaValues(joi, value, (s, path, parents) => {

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

            if (Array.isArray(result) && !schema.$_getFlag('sparse')) {
                // Enable easy stripping from array items
                result = result.filter((v) => typeof v !== 'undefined');
            }

            return {
                value: result,
                // Quirk of coerce/prepare is that it bails early if errors is truthy,
                // which doesn't allow further validation to take place. This is a problem
                // in the case of Joi.number().value('2'), for example, as number()'s coercion
                // never takes place.
                errors: errors.length ? errors : null
            };
        },
        coerce(val, { schema, state, prefs, original }) {

            const into = schema.$_getFlag('into');

            if (!into) {
                return;
            }

            // TODO localize state path?
            // TODO don't break param references: after prepare the original params are no longer what's being validated.
            return into.schema.$_validate(original, state, {
                ...prefs,
                context: {
                    ...prefs.context, // TODO test that this is passed
                    _into: val
                }
            });
        },
        rules: {
            value: {
                method(value) {

                    // TODO flatten when encountering a value which is a value()

                    return this.$_setFlag('value', value);
                }
            },
            param: {
                method(path, opts) {

                    return this.value(joi.paramRef(path, opts));
                }
            },
            // TODO implement original() for resetting the current value. Can be useful in into({ is })
            // when the value being validated changes, e.g. into({ is: joi.original().valid(joi.paramRef('x')) })
            // TODO implement an array method for stripping undefineds before sparse comes into play
            into: {
                method(options) {

                    return this.$_setFlag('into', { schema: joi.when('$_into', options) });
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

// TODO support bailing early, consider breadth-first, conservative and faithful cloning
internals.mapSchemaValues = (joi, val, fn, path = [], parents = []) => {

    if (Array.isArray(val)) {
        const arr = [];
        val.forEach((value, i) => {

            arr.push(
                internals.mapSchemaValues(joi, value, fn, [...path, i], [arr, ...parents])
            );
        });
        return arr;
    }

    if (!val || typeof val !== 'object') {
        return val;
    }

    if (joi.isSchema(val)) {
        return fn(val, path, parents);
    }

    const obj = {};
    Object.entries(val).forEach(([key, value]) => {

        obj[key] = internals.mapSchemaValues(joi, value, fn, [...path, key], [obj, ...parents]);
    });
    return obj;
};
