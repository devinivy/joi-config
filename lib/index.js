'use strict';

const internals = {};

module.exports = [
    (joi) => internals.value(joi),
    (joi) => {

        const valueExt = internals.value(joi);

        return {
            type: /^/,
            prepare: valueExt.coerce,
            rules: {
                value: {
                    method(val) {

                        return this.$_setFlag('configValue', val);
                    }
                }
            }
        };
    },
    (joi) => ({
        type: 'param',
        args(_, val, opts) {

            return joi.value(joi.ref(val, { ...opts, ancestor: 0 }));
        }
    })
];

internals.value = (joi) => ({
    type: 'value',
    args(schema, val) {

        return schema.$_setFlag('configValue', val);
    },
    coerce(params, { schema, state, prefs }) {

        let configValue = schema.$_getFlag('configValue');

        if (typeof configValue === 'undefined') {
            return;
        }

        if (joi.isRef(configValue)) {
            configValue = configValue.resolve(params, state, prefs);
        }

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

            const res = s.$_validate(params, localState, prefs);

            // TODO prefs.abortEarly

            if (res.errors) {
                errors.push(...result.errors);
            }

            return res.value;
        });

        return {
            value: result,
            // Quirk of coerce/prepare is that it bails early if errors is truthy,
            // which doesn't allow further validation to take place. This is a problem
            // in the case of Joi.number().value('2'), for example, as number()'s coercion
            // never takes place.
            errors: errors.length ? errors : null
        };
    }
});

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
