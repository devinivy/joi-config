'use strict';

const Hoek = require('@hapi/hoek');
const Topo = require('@hapi/topo');
const Traverse = require('./traverse');

const internals = {};

module.exports = [
    (joi) => ({
        // TODO usage in methods like number().min() and number().max()
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

        joi.default = exports.default;

        return {
            type: /^/,
            prepare(_, { schema, state, prefs, original }) {

                if (!(internals.original in state.ancestors)) {
                    // Only comes into play below and for paramsRef(path, { force: true }).
                    // This is necessary for "nested" validate calls (as in when({ is }), empty(), into())
                    // which break the chain to the original.
                    state.ancestors[internals.original] = original;
                }
                else {
                    original = state.ancestors[internals.original];
                }

                const valueFlag = schema.$_getFlag('value');

                if (!valueFlag) {
                    return;
                }

                const { literal, compiled, keys } = valueFlag;

                if (literal) {
                    return { value: compiled };
                }

                let value = compiled;
                const errors = [];

                if (joi.isRef(value) || joi.isExpression(value)) {
                    value = value.resolve(original, state, prefs);
                }

                const clones = new Set();
                const set = (obj, path, val) => {

                    return Traverse.setShallow(obj, path, typeof val === 'undefined' ? Traverse.strip : val, clones);
                };

                for (const key of keys) {
                    const schema = value[key];

                    const localState = state.localize(
                        [...state.path, key],
                        [value, ...state.ancestors], // Ref support
                        { key, schema } // Plays into link support
                    )

                    const validate = schema.$_validate(original, localState, prefs);

                    if (validate.errors) {

                        if (prefs.abortEarly) {
                            return {
                                value,
                                errors: validate.errors
                            };
                        }

                        errors.push(...validate.errors);
                    }

                    value = set(value, [key], validate.value);
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
            coerce(val, { schema, state, prefs }) {

                const intoWhen = schema.$_getFlag('intoWhen');

                if (!intoWhen) {
                    return;
                }

                return intoWhen.$_validate(val, state.nest(intoWhen, 'intoWhen'), prefs);
            },
            rules: {
                value: {
                    method(value, opts = {}) {

                        if (opts.literal) {
                            return obj.$_setFlag('value', {
                                literal: true,
                                compiled: value,
                                keys: []
                            });
                        }

                        const obj = this.clone();
                        const compiled = internals.compileAndRegister(joi, obj, value);
                        const topo = new Topo.Sorter();

                        // Ensure refs are going to be resolved in the correct order by sorting schemas by their ref dependencies.
                        // We handle this one level of keys at a time, and ensure subschemas are wrapped all the way up to the root.
                        // You will find that joi's object().keys() does the same thing, just has to work a little less hard to do so.

                        const isChildSchema = (x, path) => path.length === 1 && joi.isSchema(x);

                        for (const [key] of Traverse.findPaths(compiled, isChildSchema)) {
                            const schema = compiled[key];
                            internals.tryWithPath(() => topo.add(key, { group: key, after: schema.$_rootReferences() }), key);
                        }

                        return obj.$_setFlag('value', {
                            literal: false,
                            compiled,
                            keys: topo.nodes
                        }, {
                            clone: false
                        });
                    }
                },
                param: {
                    method(path, opts) {

                        return this.value(joi.paramRef(path, opts));
                    }
                },
                // TODO consider adding whenParam(paramPath, conditions) for e.g. joi.value(1).whenParam('a', { is: 10, then: joi.strip() })
                intoWhen: {
                    // We could almost just use when(), except it takes effect on the original value, but we
                    // want it to act on the later, "prepared" value. So we essentially just apply when() during
                    // the coerce() step (right after prepare()).
                    method(opts = {}) {

                        const missingOtherwise = (x) => typeof x.otherwise === 'undefined';

                        if (missingOtherwise(opts) && (!Array.isArray(opts.switch) || opts.switch.every(missingOtherwise))) {
                            // Default to strip rather than pass through original
                            opts = {
                                ...opts,
                                otherwise: joi.strip()
                            };
                        }

                        return this.$_setFlag('intoWhen', joi.when('.', opts));
                    }
                },
                into: {
                    // TODO passes over and strip already-undefined values, since undefined doesn't trigger prepare() or coerce()
                    method(map = new Map()) {

                        if (map instanceof Map || Array.isArray(map)) {
                            map = new Map(map);
                        }
                        else {
                            const keys = [...Object.keys(map), ...Object.getOwnPropertySymbols(map)];
                            map = new Map(keys.map((key) => [key, map[key]]));
                        }

                        const defaultKey = map.has(exports.default) ? exports.default : '$default';
                        const defaultValue = map.get(defaultKey);

                        map.delete(defaultKey);

                        const buildSchema = (x) => {

                            if (typeof x === 'undefined')  {
                                return x;
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

exports.default = Symbol('default');

internals.original = Symbol('original');

internals.compileAndRegister = (joi, schema, input) => {

    if (joi.isRef(input) || joi.isExpression(input)) {
        schema.$_mutateRegister(input);
        return input;
    }

    let result = input;

    const isTerminal = (x, path) => {

        return path.length !== 0 && (joi.isSchema(x) || joi.isRef(x) || joi.isExpression(x));
    };

    const clones = new Set();
    const keys = Traverse.findPaths(input, isTerminal).map(([key]) => key);

    for (const key of [...new Set(keys)]) {
        const obj = result[key];
        const compiled = joi.isSchema(obj) ? obj : joi.value(obj);
        schema.$_mutateRegister(compiled);
        result = Traverse.setShallow(result, [key], compiled, clones);
    }

    return result;
};

// TODO test this using joi's annotation features

internals.tryWithPath = function (fn, key) {

    try {
        return fn();
    }
    catch (err) {
        if (err.path !== undefined) {
            err.path = key + '.' + err.path;
        }
        else {
            err.path = key;
        }

        throw err;
    }
};
