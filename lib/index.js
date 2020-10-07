'use strict';

const Hoek = require('@hapi/hoek');
const Topo = require('@hapi/topo');
const Traverse = require('./traverse');

const internals = {};

module.exports = (() => {
    // This is an IIFE so that if joi-config switches back to
    // an array we wont need to make major whitespace changes.

    return (joi) => {

        internals.decorate(joi, 'value', (...args) => joi.any().value(...args));
        internals.decorate(joi, 'param', (...args) => joi.any().param(...args));
        internals.decorate(joi, 'whenParam', (...args) => joi.any().whenParam(...args));
        internals.decorate(joi, 'default', exports.default);

        const defaultRefOptions = (x = {}) => Hoek.applyToDefaults({ prefix: { root: '' } }, x);

        internals.decorate(joi, 'p', {
            ref: (path, opts) => joi.ref(path, defaultRefOptions(opts)),
            in: (path, opts) => joi.in(path, defaultRefOptions(opts)),
            expression: (path, opts) => joi.expression(path, defaultRefOptions(opts)),
            x: (path, opts) => joi.x(path, defaultRefOptions(opts))
        });

        return {
            type: /^/,
            prepare(val, { schema, state, prefs, original }) {

                if (!state.mainstay[internals.original]) {
                    // This is what enables us to reference params by targeting the root:
                    // the last ancestor item is set to the params themselves. Now we
                    // can write e.g. joi.ref('/x') to reference the value of "x" within
                    // the input/params. In a traditional schema the value being validated
                    // is the same shape as the validation output, but that's not the case for us.
                    state.ancestors.push(original);
                    state.mainstay[internals.original] = true;
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
                    value = value.resolve(val, state, prefs);
                }

                if (keys.length) {
                    value = Hoek.clone(value, { shallow: true });
                }

                for (const key of keys) {
                    const subschema = value[key];

                    const localState = state.localize(
                        [...state.path, key],
                        [value, ...state.ancestors], // Ref support
                        { key, schema: subschema } // Plays into link support
                    );

                    const validate = subschema.$_validate(val, localState, prefs);

                    if (validate.errors) {

                        if (prefs.abortEarly) {
                            return {
                                value,
                                errors: validate.errors
                            };
                        }

                        errors.push(...validate.errors);
                    }
                    else {
                        const subvalue = typeof validate.value === 'undefined' ? Traverse.strip : validate.value;
                        value = Traverse.set(value, key, subvalue);
                    }
                }

                return {
                    // Convert to this symbol representing undefined in order to avoid skipping over the
                    // coerce step when the value is actually undefined. We would like to be able to map
                    // undefined via an into({ $default }), for example.
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

                // We cannot validate against undefined, as it will fall through untouched.
                // So we cast it to null for the purposes of intoWhen()'s validation.  Bear
                // in mind the fallback behavior when there are no matches is to strip() the
                // value, which would cast it back to undefined.

                return intoWhen.$_validate(typeof value === 'undefined' ? null : value, state.nest(intoWhen, 'intoWhen'), prefs);
            },
            rules: {
                value: {
                    method(value, opts = {}) {

                        const obj = this.clone();

                        if (opts.literal) {
                            return obj.$_setFlag('value', {
                                literal: true,
                                compiled: value,
                                keys: []
                            });
                        }

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

                        return this.value(joi.p.ref(path, opts));
                    }
                },
                whenParam: {
                    method(path, opts) {

                        return this.when(joi.p.ref(path), opts);
                    }
                },
                intoWhen: {
                    // We could almost just use when(), except it takes effect on the original value, but we
                    // want it to act on the later, "prepared" value. So we essentially just apply when() during
                    // the coerce() step (right after prepare()).
                    method(opts = {}) {

                        const clone = (x) => ({ ...x });

                        const buildSchema = (x) => {

                            if (joi.isSchema(x)) {
                                return x;
                            }

                            if (typeof x === 'undefined') {
                                return joi.strip();
                            }

                            return joi.value(x);
                        };

                        const missingOtherwise = (x) => !('otherwise' in x);

                        opts = clone(opts);

                        if ('switch' in opts) {

                            if (Array.isArray(opts.switch)) {
                                opts.switch = opts.switch.map((sw) => {

                                    sw = clone(sw);
                                    sw.then = buildSchema(sw.then);

                                    if (!missingOtherwise(sw)) {
                                        sw.otherwise = buildSchema(sw.otherwise);
                                    }

                                    return sw;
                                });
                            }

                            if (!Array.isArray(opts.switch) || opts.switch.every(missingOtherwise)) {
                                // Default to strip rather than pass through original
                                opts.otherwise = buildSchema(opts.otherwise);
                            }
                        }
                        else {
                            opts.then = buildSchema(opts.then);
                            opts.otherwise = buildSchema(opts.otherwise);
                        }

                        return this.$_setFlag('intoWhen', joi.when('.', opts));
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

                        const defaultKey = map.has(exports.default) ? exports.default : '$default';
                        const defaultValue = map.get(defaultKey);

                        map.delete(defaultKey);

                        return this.intoWhen({
                            switch: [...map.entries()]
                                .map(([is, then]) => ({ is, then })),
                            otherwise: defaultValue
                        });
                    }
                }
            }
        };
    };
})();

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

    const keys = Traverse.findPaths(input, isTerminal).map(([key]) => key);

    if (keys.length) {
        result = Hoek.clone(result, { shallow: true });
    }

    for (const key of [...new Set(keys)]) {
        const obj = result[key];
        const compiled = joi.isSchema(obj) ? obj : joi.value(obj);
        schema.$_mutateRegister(compiled);
        result = Traverse.set(result, key, compiled);
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

internals.decorate = (joi, prop, value) => {

    // Essentially recreating joi's assertion during extension by a type
    Hoek.assert(typeof joi[prop] === 'undefined', `Cannot override name ${prop}`);

    joi[prop] = value;

    return joi;
};
