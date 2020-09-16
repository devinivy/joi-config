'use strict';

const Hoek = require('@hapi/hoek');
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

                let value = valueFlag.value;

                if (valueFlag.opts.literal) {
                    return { value };
                }

                const errors = [];
                const clones = new Set();

                const set = (obj, path, val) => {

                    return Traverse.setShallow(obj, path, typeof val === 'undefined' ? Traverse.strip : val, clones);
                };

                const getAndTouch = (obj, path) => {

                    const val = Hoek.reach(obj, path);
                    // TODO no longer need to touch because of the DFS ordering ?
                    const touched = Traverse.setShallow(obj, path, val, clones);
                    const parents = path.map((key, i) => {

                        return Hoek.reach(touched, path.slice(0, i));
                    });

                    return [val, ...parents.reverse()];
                };

                const isResolvable = (x) => joi.isSchema(x) || joi.isRef(x) || joi.isExpression(x);

                // Needs to be solidified but findPaths() is DFS, so reversing the
                // results enforces that children are validated before parents, which
                // is important (e.g. for ancestors to be correct at the time of validation).

                for (const path of Traverse.findPaths(value, isResolvable)) {
                    const [resolvable, ...parents] = getAndTouch(value, path);

                    if (joi.isSchema(resolvable)) {

                        // https://github.com/sideway/joi/blob/f309431e17bce06c3d4e2ace35ed35cbabd01799/lib/types/keys.js#L107

                        const localState = state.localize(
                            [...state.path, ...path],
                            [...parents, ...state.ancestors], // Ref support
                            {
                                key: path[path.length - 1], // Link support
                                schema: resolvable
                            }
                        );

                        const validate = resolvable.$_validate(original, localState, prefs);

                        if (validate.errors) {

                            if (prefs.abortEarly) {
                                return {
                                    value,
                                    errors: validate.errors
                                };
                            }

                            errors.push(...validate.errors);
                        }

                        value = set(value, path, validate.value);
                    }
                    else if (joi.isRef(resolvable) || joi.isExpression(resolvable)) {
                        const resolved = resolvable.resolve(original, state, prefs);
                        value = set(value, path, resolved);
                    }
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

                        return this.$_setFlag('value', { value, opts });
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
