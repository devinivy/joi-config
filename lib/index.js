'use strict';

const internals = {};

module.exports = [
    (joi) => ({
        type: 'paramRef',
        args(_, path, opts = {}) {

            const { force, ...refOpts } = opts;

            // The idea is that we'll abuse self-reference for digging into the original value being validated, i.e. the params.
            const ref = joi.ref(path, { ...refOpts, ancestor: 0 });

            if (force) {

                // This is a hack to deal with some special cases where paramRef()
                // is outside of a values() context where the original value (i.e. params)
                // are preserved for use by refs.  This can happen in a non-values()
                // schema, or in special cases like when({ is: ref }), empty(ref), default(ref).
                // The idea is to only resort to this hack if the user asks for it,
                // since it is a blunt instrument and not compatible with typical
                // ref param reference (e.g. ref('.a') or expression({.a + 1})).

                const { resolve } = ref;

                ref.resolve = (value, state, ...others) => {

                    if (internals.original in state.ancestors) {
                        value = state.ancestors[internals.original];
                    }

                    return resolve.apply(ref, [value, state, ...others]);
                };
            }

            return ref;
        }
    }),
    (joi) => {

        joi.default = internals.default;

        return {
            type: /^/,
            prepare(_, { schema, state, prefs, original }) {

                if (original instanceof internals.ValueWithOriginal) {
                    // Only comes into play for into(), to allow reference to the original
                    // without breaking the original value falling through in the case of no mapping.
                    original = original.original;
                }

                if (!(internals.original in state.ancestors)) {
                    // Only comes into play for paramsRef(path, { force: true })
                    state.ancestors[internals.original] = original;
                }

                let value = schema.$_getFlag('value');

                if (typeof value === 'undefined') {
                    return;
                }

                if (joi.isRef(value) || joi.isExpression(value)) {
                    value = value.resolve(original, state, prefs);
                }

                const errors = [];

                value = internals.mapSchemaValues(joi, value, (s, path, parents) => {

                    // https://github.com/sideway/joi/blob/f309431e17bce06c3d4e2ace35ed35cbabd01799/lib/types/keys.js#L107

                    const localState = state.localize(
                        [...state.path, ...path],
                        [...parents, ...state.ancestors], // Ref support
                        {
                            key: path[path.length - 1], // Link support
                            schema: s
                        }
                    );

                    const validate = s.$_validate(original, localState, prefs);

                    // TODO prefs.abortEarly

                    if (validate.errors) {
                        errors.push(...validate.errors);
                    }

                    return validate.value;
                });

                if (Array.isArray(value) && !schema.$_getFlag('sparse')) {
                    // TODO stripping could be more natural and compose nicely with into(): see how keys and arrays deal with this.
                    // Enable easy stripping from array items
                    value = value.filter((v) => typeof v !== 'undefined');
                }

                return {
                    value,
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

                // into.schema is joi.when('.value', options);

                const { value, errors } = into.schema.$_validate(
                    new internals.ValueWithOriginal({
                        value: val,
                        original
                    }),
                    state.nest(into.schema, 'into'),
                    prefs
                );

                return {
                    value: value instanceof internals.ValueWithOriginal ? value.value : value,
                    errors
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

                        return this.value(joi.paramRef(path, opts));
                    }
                },
                // TODO consider adding whenParam(paramPath, conditions) for e.g. joi.value(1).whenParam('a', { is: 10, then: joi.strip() })
                intoWhen: {
                    method(options) {

                        return this.$_setFlag('into', { schema: joi.when('.value', options) });
                    }
                },
                into: {
                    method(map = new Map()) {

                        if (map instanceof Map || Array.isArray(map)) {
                            map = new Map(map);
                        }
                        else {
                            const keys = [...Object.keys(map), ...Object.getOwnPropertySymbols(map)];
                            map = new Map(keys.map((key) => [key, map[key]]));
                        }

                        const defaultKey = map.has(internals.default) ? internals.default : '$default';
                        const defaultValue = map.get(defaultKey);

                        map.delete(defaultKey);

                        const buildSchema = (x) => {

                            if (typeof x === 'undefined')  {
                                return joi.strip();
                            }

                            if (joi.isSchema(x)) {
                                return x;
                            }

                            return joi.value(x);
                        };

                        return this.intoWhen({
                            switch: [...map.entries()].map(([is, then]) => ({
                                is,
                                then: buildSchema(then)
                            })),
                            // TODO consider moving strip functionality to intoWhen()
                            otherwise: buildSchema(defaultValue)
                        });
                    }
                }
            }
        };
    },
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

internals.original = Symbol('original');

internals.default = Symbol('default');

internals.ValueWithOriginal = class ValueWithOriginal {
    constructor({ value, original }) {

        this.value = value;
        this.original = original;
    }
};
