'use strict';

const Topo = require('@hapi/topo');
const Traverse = require('./traverse');

const internals = {};

module.exports = [
    (joi) => {

        joi.default = exports.default;

        return {
            type: /^/,
            prepare(_, { schema, state, prefs, original }) {

                if (!(internals.original in state.ancestors)) {
                    state.ancestors.push(original);
                    state.ancestors[internals.original] = true;
                }
                else {
                    original = state.ancestors[state.ancestors.length - 1];
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
                    const subschema = value[key];

                    const localState = state.localize(
                        [...state.path, key],
                        [value, ...state.ancestors], // Ref support
                        { key, schema: subschema } // Plays into link support
                    );

                    const validate = subschema.$_validate(original, localState, prefs);

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
                    value: !errors.length && typeof value === 'undefined' ? internals.undefined : value,
                    // Quirk of coerce/prepare is that it bails early if errors is truthy,
                    // which doesn't allow further validation to take place. This is a problem
                    // in the case of Joi.number().value('2'), for example, as number()'s coercion
                    // never takes place.
                    errors: errors.length ? errors : null
                };
            },
            coerce(val, { schema, state, prefs }) {

                const value = val === internals.undefined ? undefined : val;
                const intoWhen = schema.$_getFlag('intoWhen');

                if (!intoWhen) {
                    return { value };
                }

                return intoWhen.$_validate(typeof value === 'undefined' ? null : value, state.nest(intoWhen, 'intoWhen'), prefs);
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
                    method(path, opts = {}) {

                        const { root = '/' } = opts;

                        return this.value(joi.ref(`${root}${path}`, opts));
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

internals.undefined = Symbol('undefined');

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
