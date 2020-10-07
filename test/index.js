
'use strict';

// Load modules

const Lab = require('@hapi/lab');
const Code = require('@hapi/code');
const JoiBase = require('joi');
const JoiConfig = require('..');
const Joi = require('joi');

// Test shortcuts

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;

describe('JoiConfig', () => {

    const joi = JoiBase.extend(JoiConfig);

    it('is an extension to joi.', () => {

        expect(joi.value).to.be.a.function();
        expect(joi.isSchema(joi.value())).to.be.true();
        expect(JoiBase.value).to.not.be.a.function();
    });

    const attempt = (...args) => expect(joi.attempt(...args));
    const fail = (...args) => expect(() => joi.attempt(...args));

    describe('value()', () => {

        it('prepares validation for the passed value.', () => {

            attempt({}, joi.any().value(1)).to.equal(1);
            attempt({}, joi.number().value(1)).to.equal(1);
            attempt({}, joi.number().value('2')).to.equal(2);
            attempt({}, joi.object().value({ a: { b: 'c' } })).to.equal({ a: { b: 'c' } });
            attempt({}, joi.array().items(joi.string()).value(['a', 'b', 'c'])).to.equal(['a', 'b', 'c']);

            fail({}, joi.any().value().required()).to.throw('"value" is required');
            fail({}, joi.string().value(1)).to.throw('"value" must be a string');
            fail({}, joi.number().value('two')).to.throw('"value" must be a number');
            fail({}, joi.object().value('not an object')).to.throw('"value" must be of type object');
            fail({}, joi.array().items(joi.string()).value(['a', 2, 'c'])).to.throw('"[1]" must be a string');
        });

        it('supports shorthand for any().value().', () => {

            expect(joi.value(1).describe()).to.equal(joi.any().value(1).describe());
            expect(joi.value(1).describe()).to.equal({
                type: 'any',
                flags: { value: { literal: false, compiled: 1, keys: [] } }
            });

            attempt({}, joi.value(1)).to.equal(1);
            attempt({}, joi.value({})).to.equal({});
            fail({}, joi.value().required()).to.throw('"value" is required');
        });

        it('plays nice with undefined.', () => {

            attempt({}, joi.value()).to.equal(undefined);
            attempt({}, joi.any().value()).to.equal(undefined);
            attempt({}, joi.value(undefined)).to.equal(undefined);
            attempt({}, joi.value(undefined).default(7)).to.equal(7);
        });

        it('evaluates refs and expressions.', () => {

            const prefs = { context: { a: { b: 'c' }, d: 'e', f: [1, 2] } };

            attempt({}, joi.value(joi.ref('$d')), prefs).to.equal('e');
            attempt({}, joi.value(joi.ref('$a.b')), prefs).to.equal('c');
            attempt({}, joi.value(joi.ref('$a')), prefs).to.equal({ b: 'c' });
            attempt({}, joi.value(joi.ref('$f')), prefs).to.equal([1, 2]);
            attempt({}, joi.value(joi.x('{$f.0 + $f.1}')), prefs).to.equal(3);
        });

        it('evaluates refs, expressions, and schemas deeply.', () => {

            const schema = joi.value({
                a: [
                    'b',
                    joi.ref('$a.b')
                ],
                b: joi.number().value('4').min(joi.x('{$f.0 + $f.1 + 1}')),
                c: {
                    d: 'e',
                    f: { g: joi.value('h') }
                },
                i: joi.x('{$f.1 * $f.1}')
            });

            const prefsPassing = { context: { a: { b: 'c' }, d: 'e', f: [1, 2] } };

            attempt({}, schema, prefsPassing).to.equal({
                a: ['b', 'c'],
                b: 4,
                c: { d: 'e', f: { g: 'h' } },
                i: 4
            });

            const prefsFailing = { context: { a: { b: 'c' }, d: 'e', f: [2, 2] } };

            fail({}, schema, prefsFailing).to.throw('"b" must be greater than or equal to {$f.0 + $f.1 + 1}');
        });

        it('valuates relative refs in order based on dependency.', () => {

            const prefs = { context: { x: 6 } };
            const schema = joi.value({
                a1: joi.ref('a8'),
                a2: { c: joi.ref('...a7') },
                a3: { e: joi.ref('...a6') },
                a4: joi.ref('a5'),
                a5: joi.ref('$x'),
                a6: joi.ref('a4'),
                a7: { d: joi.ref('...a3') },
                a8: { b: joi.ref('...a2') }
            });

            attempt({}, schema, prefs).to.equal({
                a1: { b: { c: { d: { e: 6 } } } },
                a2: { c: { d: { e: 6 } } },
                a3: { e: 6 },
                a4: 6,
                a5: 6,
                a6: 6,
                a7: { d: { e: 6 } },
                a8: { b: { c: { d: { e: 6 } } } }
            });

            expect(() => joi.value({ a: joi.ref('b'), b: joi.ref('a') })).to.throw('item added into group a created a dependencies error');
        });

        it('resolves literal values.', () => {

            const prefs = { context: { a: {} } };
            const refSchema = joi.object().ref();

            fail({}, refSchema.value(joi.ref('$a')), prefs).to.throw('"value" must be a Joi reference');
            attempt({}, refSchema.value(joi.ref('$a'), { literal: true }), prefs).to.exist();
        });

        it('permits circular reference.', () => {

            const a = {};
            a.a = a;

            const schema = joi.value(a);

            attempt({}, schema).to.shallow.equal(a);
        });

        // TODO cloning tests
    });

    describe('param()', () => {

        it('resolves params from validation input.', () => {

            attempt({ x: '1' }, joi.any().param('x')).to.equal('1');
            attempt({ x: '1' }, joi.number().param('x')).to.equal(1);
            attempt({ x: ['a', 'b'] }, joi.any().param('x')).to.equal(['a', 'b']);
            attempt({ x: { y: ['a', 'b'] } }, joi.array().param('x.y')).to.equal(['a', 'b']);
            attempt({ x: { y: ['a', 'b'] } }, joi.string().param('x.y.1')).to.equal('b');
            fail({ x: 1 }, joi.any().param('y').required()).to.throw('"value" is required');
        });

        it('supports shorthand for any().param().', () => {

            expect(joi.param('x').describe()).to.equal(joi.param('x').describe());
            expect(joi.param('x').describe()).to.equal({
                type: 'any',
                flags: {
                    value: {
                        literal: false,
                        compiled: {
                            ref: {
                                ancestor: 'root',
                                path: ['x']
                            }
                        },
                        keys: []
                    }
                }
            });

            attempt({ x: '1' }, joi.param('x')).to.equal('1');
            attempt({ x: { y: { z: 1 } } }, joi.param('x.y')).to.equal({ z: 1 });
            fail({ x: 1 }, joi.param('y').required()).to.throw('"value" is required');
        });

        it('accepts ref options.', () => {

            const params = { x: { y: 1 } };

            attempt(params, joi.param('x/y', { separator: '/' })).to.equal(1);
            attempt(params, joi.param('/x.y', { prefix: { root: '/' } })).to.equal(1);
        });

        it('can be placed deeply within value().', () => {

            const params = { x: 1, y: { z: '2' } };
            const schema = joi.value({
                a: joi.param('x'),
                b: {
                    c: joi.number().param('y.z'),
                    d: joi.param('w').default(3)
                }
            });

            attempt(params, schema).to.equal({ a: 1, b: { c: 2, d: 3 } });
        });
    });

    describe('p.ref()', () => {

        it('resolves to input parameter in value().', () => {

            const params = { x: 1, y: { z: '2' } };

            attempt(params, joi.value(joi.p.ref('y.z'))).to.equal('2');

            const schema = joi.value({
                a: joi.value(joi.p.ref('x')),
                b: {
                    c: joi.number().value(joi.p.ref('y.z')),
                    d: joi.value(joi.p.ref('w')).default(3)
                }
            });

            attempt(params, schema).to.equal({ a: 1, b: { c: 2, d: 3 } });
        });

        it('resolves to input parameter in rules that accept a ref.', () => {

            const params = { x: 1, y: { z: '2' }, w: 3 };

            const x = joi.p.ref('x');
            const yz = joi.p.ref('y.z');
            const w = joi.p.ref('w');

            const schemas = {};

            // default()
            schemas.default = joi.value(null).empty(null).default(yz);
            attempt(params, schemas.default).to.equal('2');

            // min() / max()

            schemas.minPass = joi.number().value(1).min(x);
            attempt(params, schemas.minPass).to.equal(1);

            schemas.minFail = joi.number().value(0).min(x);
            fail(params, schemas.minFail).to.throw('"value" must be greater than or equal to ref:root:x');

            // length()
            schemas.lengthPass = joi.string().value('abc').length(w);
            attempt(params, schemas.lengthPass).to.equal('abc');

            schemas.lengthFail = joi.string().value('abcd').length(w);
            fail(params, schemas.lengthFail).to.throw('"value" length must be ref:root:w characters long');

            // assert()
            schemas.assertPass = joi.object().assert('.a', yz).value({ a: '2' });
            attempt(params, schemas.lengthPass).to.equal('abc');

            schemas.assertFail = joi.object().assert('.a', yz).value({ a: '4' });
            fail(params, schemas.assertFail).to.throw('"value" is invalid because "a" failed to pass the assertion test');
        });

        it('resolves to input parameter in when().', () => {

            const params = { x: 1, y: { z: '2' }, w: 3 };

            const x = joi.p.ref('x');
            const yz = joi.p.ref('y.z');
            const w = joi.p.ref('w');

            const schemaSubject = joi.value({
                a: joi.value('!').when(x, { is: 1, then: joi.forbidden() })
            });

            fail(params, schemaSubject).to.throw('"a" is not allowed');

            const schemaCondition = joi.value({
                a: joi.value('!').when('b', { is: Joi.valid(yz), then: joi.forbidden() }),
                b: '2'
            });

            fail(params, schemaCondition).to.throw('"a" is not allowed');

            const schemaConsequent = joi.value({
                a: joi.value('!').when('b', { is: '2', then: joi.string().length(w) }),
                b: '2'
            });

            fail(params, schemaConsequent).to.throw('"a" length must be ref:root:w characters long');
        });

        it('accepts ref options.', () => {

            const params = { x: { y: 1 } };

            attempt(params, joi.value(joi.p.ref('x/y', { separator: '/' }))).to.equal(1);
            attempt(params, joi.value(joi.p.ref('/x.y', { prefix: { root: '/' } }))).to.equal(1);
        });

        it('is equivalent to a root reference without a prefix.', () => {

            expect(joi.value(joi.p.ref('x')).describe()).to.equal(joi.value(joi.ref('/x')).describe());
            expect(joi.value(joi.p.ref('x')).describe()).to.equal({
                type: 'any',
                flags: {
                    value: {
                        compiled: {
                            ref: {
                                ancestor: 'root',
                                path: ['x']
                            }
                        },
                        keys: [],
                        literal: false
                    }
                }
            });
        });

        it('is the connection between value() and param().', () => {

            expect(joi.value(joi.p.ref('x')).describe()).to.equal(joi.param('x').describe());
            expect(joi.value(joi.p.ref('x')).describe()).to.equal({
                type: 'any',
                flags: {
                    value: {
                        compiled: {
                            ref: {
                                ancestor: 'root',
                                path: ['x']
                            }
                        },
                        keys: [],
                        literal: false
                    }
                }
            });
        });
    });

    describe('p.in()', () => {

        it('resolves to input parameter in rules that accept in-references.', () => {

            const params = { a: [1, 2, 3], b: ['one', 'two', 'three'] };

            attempt(params, joi.value(2).valid(joi.p.in('a'))).to.equal(2);
            fail(params, joi.value(4).valid(joi.p.in('a'))).to.throw('"value" must be [ref:root:a]');

            attempt(params, joi.value('four').invalid(joi.p.in('b'))).to.equal('four');
            fail(params, joi.value('two').invalid(joi.p.in('b'))).to.throw('"value" contains an invalid value');
        });

        it('accepts ref options.', () => {

            const params = { x: { y: [1, 2] } };

            attempt(params, joi.value(2).valid(joi.p.in('x/y', { separator: '/' }))).to.equal(2);
            fail(params, joi.value(4).valid(joi.p.in('x/y', { separator: '/' }))).to.throw('"value" must be [ref:root:x/y]');
            attempt(params, joi.value(2).valid(joi.p.in('/x.y', { prefix: { root: '/' } }))).to.equal(2);
            fail(params, joi.value(4).valid(joi.p.in('/x.y', { prefix: { root: '/' } }))).to.throw('"value" must be [ref:root:x.y]');
        });
    });

    describe('p.expression() (and p.x())', () => {

        it('evaluates using input parameters in value().', () => {

            const params = { x: 1, y: { z: '2' }, w: 3 };

            attempt(params, joi.value(joi.p.expression('{y.z + \'2\'}'))).to.equal('22');

            const schema = joi.value({
                a: joi.value(joi.p.expression('{x * 5}')),
                b: {
                    c: joi.number().value(joi.p.expression('{y.z + \'2\'}')),
                    d: joi.value(joi.p.expression('{x + w}'))
                }
            });

            attempt(params, schema).to.equal({ a: 5, b: { c: 22, d: 4 } });
        });

        it('evaluates using input parameters in rules that accept an expression.', () => {

            const params = { x: 5, y: { z: '2' }, w: 4 };

            const x = joi.p.expression('{x / 5}');
            const yz = joi.p.expression('{y.z + \'2\'}');
            const w = joi.p.expression('{w - 1}');

            const schemas = {};

            // default()
            schemas.default = joi.value(null).empty(null).default(yz);
            attempt(params, schemas.default).to.equal('22');

            // min() / max()

            schemas.minPass = joi.number().value(1).min(x);
            attempt(params, schemas.minPass).to.equal(1);

            schemas.minFail = joi.number().value(0).min(x);
            fail(params, schemas.minFail).to.throw('"value" must be greater than or equal to {x / 5}');

            // length()
            schemas.lengthPass = joi.string().value('abc').length(w);
            attempt(params, schemas.lengthPass).to.equal('abc');

            schemas.lengthFail = joi.string().value('abcd').length(w);
            fail(params, schemas.lengthFail).to.throw('"value" length must be {w - 1} characters long');

            // assert()
            schemas.assertPass = joi.object().assert('.a', yz).value({ a: '22' });
            attempt(params, schemas.lengthPass).to.equal('abc');

            schemas.assertFail = joi.object().assert('.a', yz).value({ a: '24' });
            fail(params, schemas.assertFail).to.throw('"value" is invalid because "a" failed to pass the assertion test');
        });

        it('evaluates using input parameters in when().', () => {

            const params = { x: 5, y: { z: '2' }, w: 4 };

            const yz = joi.p.expression('{y.z + \'2\'}');
            const w = joi.p.expression('{w - 1}');

            const schemaCondition = joi.value({
                a: joi.value('!').when('b', { is: Joi.valid(yz), then: joi.forbidden() }),
                b: '22'
            });

            fail(params, schemaCondition).to.throw('"a" is not allowed');

            const schemaConsequent = joi.value({
                a: joi.value('!').when('b', { is: '2', then: joi.string().length(w) }),
                b: '2'
            });

            fail(params, schemaConsequent).to.throw('"a" length must be {w - 1} characters long');
        });

        it('accepts expression options.', () => {

            const params = { x: { y: 2 } };

            attempt(params, joi.value(joi.p.expression('{x:y * 5}', { separator: ':' }))).to.equal(10);
            attempt(params, joi.value(joi.p.expression('{:x.y * 5}', { prefix: { root: ':' } }))).to.equal(10);
        });

        it('is aliased to p.x().', () => {

            expect(joi.value(joi.p.x('{x + 1}')).describe()).to.equal(joi.value(joi.p.expression('{x + 1}')).describe());
            expect(joi.value(joi.p.x('{x + 1}')).describe()).to.equal({
                type: 'any',
                flags: {
                    value: {
                        compiled: {
                            template: '{x + 1}',
                            options: {
                                prefix: { root: '' }
                            }
                        },
                        keys: [],
                        literal: false
                    }
                }
            });

            const params = { x: 1, y: { z: '2' }, w: 3 };

            attempt(params, joi.value(joi.p.x('{y.z + \'2\'}'))).to.equal('22');

            const schema = joi.value({
                a: joi.value(joi.p.x('{x * 5}')),
                b: {
                    c: joi.number().value(joi.p.x('{y.z + \'2\'}')),
                    d: joi.value(joi.p.x('{x + w}'))
                }
            });

            attempt(params, schema).to.equal({ a: 5, b: { c: 22, d: 4 } });
        });
    });

    describe('whenParam()', () => {
        // TODO document/test caveat around usage as direct schema, e.g. not as a key's schema.

        it('applies a when() referencing a param.', () => {

            const whenParam = (val) => {

                return joi.any().value(val).whenParam('x', {
                    switch: [
                        { is: 1, then: joi.valid(11) },
                        { is: 2, then: joi.forbidden() }
                    ],
                    otherwise: joi.number()
                });
            };

            attempt({ x: 1 }, joi.value({ a: whenParam(11) })).to.equal({ a: 11 });
            fail({ x: 1 }, joi.value({ a: whenParam(12) })).to.throw('"a" must be [11]');

            attempt({ x: 2 }, joi.value({ a: whenParam(undefined) })).to.equal({});
            fail({ x: 2 }, joi.value({ a: whenParam(12) })).to.throw('"a" is not allowed');

            attempt({ x: 3 }, joi.value({ a: whenParam(11) })).to.equal({ a: 11 });
            fail({ x: 3 }, joi.value({ a: whenParam('twelve') })).to.throw('"a" must be a number');
        });

        it('conditionally strips array items.', () => {

            const schema = joi.value([
                1,
                joi.value(2)
                    .whenParam('x', { is: 1, then: joi.strip() }),
                3
            ]);

            attempt({ x: 1 }, schema).to.equal([1, 3]);
            attempt({ x: 0 }, schema).to.equal([1, 2, 3]);
        });

        it('conditionally strips object items.', () => {

            const schema = joi.value({
                x: 1,
                y: joi.value(2)
                    .whenParam('x', { is: 1, then: joi.strip() }),
                z: 3
            });

            attempt({ x: 1 }, schema).to.equal({ x: 1, z: 3 });
            attempt({ x: 0 }, schema).to.equal({ x: 1, y: 2, z: 3 });
        });

        it('supports shorthand for any().whenParam().', () => {

            const whenParam = (val) => {

                return joi.whenParam('x', {
                    switch: [
                        { is: 1, then: joi.valid(11) },
                        { is: 2, then: joi.forbidden() }
                    ],
                    otherwise: joi.number()
                }).value(val);
            };

            attempt({ x: 1 }, joi.value({ a: whenParam(11) })).to.equal({ a: 11 });
            fail({ x: 1 }, joi.value({ a: whenParam(12) })).to.throw('"a" must be [11]');

            attempt({ x: 2 }, joi.value({ a: whenParam(undefined) })).to.equal({});
            fail({ x: 2 }, joi.value({ a: whenParam(12) })).to.throw('"a" is not allowed');

            attempt({ x: 3 }, joi.value({ a: whenParam(11) })).to.equal({ a: 11 });
            fail({ x: 3 }, joi.value({ a: whenParam('twelve') })).to.throw('"a" must be a number');
        });

        it('is equivalent to a when() with a param ref.', () => {

            const whenParam = joi.whenParam('x', { is: joi.exist(), then: joi.forbidden() });
            const whenParamRef = joi.when(joi.p.ref('x'), { is: joi.exist(), then: joi.forbidden() });

            expect(whenParam.describe()).to.equal(whenParamRef.describe());
            expect(whenParam.describe()).to.equal({
                type: 'any',
                whens: [{
                    ref: {
                        ancestor: 'root',
                        path: ['x']
                    },
                    is: {
                        type: 'any',
                        flags: { presence: 'required' }
                    },
                    then: {
                        type: 'any',
                        flags: { presence: 'forbidden' }
                    }
                }]
            });
        });
    });

    describe('intoWhen()', () => {

        it('maps values using when() syntax.', () => {

            const schemaSimpleFor = (x) => {

                return joi.value(x).intoWhen({
                    is: 1,
                    then: joi.value('one'),
                    otherwise: joi.value('infinity')
                });
            };

            attempt({}, schemaSimpleFor(1)).to.equal('one');
            attempt({}, schemaSimpleFor(0)).to.equal('infinity');

            const schemaSwitchFor = (x) => {

                return joi.value(x).intoWhen({
                    switch: [
                        { is: 1, then: joi.value('one') },
                        { is: 2, then: joi.value('two') },
                        { is: 3, then: joi.value('three') }
                    ],
                    otherwise: joi.value('infinity')
                });
            };

            attempt({}, schemaSwitchFor(2)).to.equal('two');
            attempt({}, schemaSwitchFor(0)).to.equal('infinity');
        });

        it('wraps literals, refs, and expressions in value().', () => {

            const schemaSimpleFor = (x) => {

                return joi.value({
                    a: 'infin',
                    b: joi.value(x).intoWhen({
                        is: 1,
                        then: 'one',
                        otherwise: joi.x('{a + \'ity\'}')
                    })
                });
            };

            attempt({}, schemaSimpleFor(1)).to.equal({ a: 'infin', b: 'one' });
            attempt({}, schemaSimpleFor(0)).to.equal({ a: 'infin', b: 'infinity' });

            const schemaSwitchFor = (x) => {

                return joi.value({
                    a: 'three',
                    b: 'fo',
                    c: joi.value(x).intoWhen({
                        switch: [
                            { is: 1, then: 'one' },
                            { is: 2, then: joi.p.ref('x') },
                            { is: 3, then: joi.ref('a') },
                            { is: 4, then: joi.x('{b + \'ur\'}') }
                        ],
                        otherwise: 'infinity'
                    })
                });
            };

            attempt({ x: 'two' }, schemaSwitchFor(1)).to.equal({ a: 'three', b: 'fo', c: 'one' });
            attempt({ x: 'two' }, schemaSwitchFor(2)).to.equal({ a: 'three', b: 'fo', c: 'two' });
            attempt({ x: 'two' }, schemaSwitchFor(3)).to.equal({ a: 'three', b: 'fo', c: 'three' });
            attempt({ x: 'two' }, schemaSwitchFor(4)).to.equal({ a: 'three', b: 'fo', c: 'four' });
            attempt({ x: 'two' }, schemaSwitchFor(0)).to.equal({ a: 'three', b: 'fo', c: 'infinity' });
        });

        it('passes through prepared value.', () => {

            const params = { a: 1 };
            const schema = joi.value({
                x: joi.param('a').intoWhen({
                    is: 2,
                    then: joi.value('two'),
                    otherwise: joi.any()
                })
            });

            attempt(params, schema).to.equal({ x: 1 });
        });

        it('strips when otherwise case is missing.', () => {

            const params = { a: 1 };
            const schema = joi.value({
                x: joi.param('a').intoWhen({
                    is: 2,
                    then: joi.value('two')
                })
            });

            attempt(params, schema).to.equal({});
        });

        it('strips when then case is missing.', () => {

            const params = { a: 2 };
            const schema = joi.value({
                x: joi.param('a').intoWhen({
                    is: 2,
                    otherwise: joi.value('infinity')
                })
            });

            attempt(params, schema).to.equal({});
        });

        it('is compatible with default().', () => {

            const params = { a: 2 };
            const schema = joi.value({
                x: joi.param('a').default('two').intoWhen({
                    is: 1,
                    then: joi.value('one'),
                    otherwise: joi.strip()
                })
            });

            attempt(params, schema).to.equal({ x: 'two' });
        });

        it('does not add otherwise case if it is handled within switch', () => {

            const schemaSwitchFor = (x) => {

                return joi.value(x).intoWhen({
                    switch: [
                        { is: 1, then: joi.value('one') },
                        { is: 2, then: joi.value('two') },
                        { is: 3, then: 'three', otherwise: 'infinity' }
                    ]
                });
            };

            attempt({}, schemaSwitchFor(1)).to.equal('one');
            attempt({}, schemaSwitchFor(2)).to.equal('two');
            attempt({}, schemaSwitchFor(3)).to.equal('three');
            attempt({}, schemaSwitchFor(0)).to.equal('infinity');
        });

        it('allows joi to complain about invalid switch.', () => {

            expect(() => {

                joi.value().intoWhen({
                    is: 1,
                    switch: {}
                });
            }).to.throw('"switch" must be an array');
        });

        it('evaluates ref in { is }.', () => {

            const params = { a: 1, b: 'two', c: 1 };
            const schema = joi.value({
                x: joi.param('a').intoWhen({
                    is: joi.p.ref('c'),
                    then: joi.param('b'),
                    otherwise: joi.value(null)
                })
            });

            attempt(params, schema).to.equal({ x: 'two' });
        });

        it('maps undefined value.', () => {

            const params = {};
            const schema = joi.param('ernnt').intoWhen({
                is: joi.number(),
                then: joi.value(false),
                otherwise: joi.value(true)
            });

            attempt(params, schema).to.equal(true);
        });
    });

    describe('into() (and default)', () => {

        it('maps value using an object.', () => {

            const schema = joi.value({
                x: joi.param('a').into({
                    one: 1,
                    two: 2
                })
            });

            attempt({ a: 'one' }, schema).to.equal({ x: 1 });
            attempt({ a: 'two' }, schema).to.equal({ x: 2 });
            attempt({ a: 'three' }, schema).to.equal({});
        });

        it('maps value using an array.', () => {

            const schema = joi.value({
                x: joi.param('a').into([
                    ['one', 1],
                    ['two', 2]
                ])
            });

            attempt({ a: 'one' }, schema).to.equal({ x: 1 });
            attempt({ a: 'two' }, schema).to.equal({ x: 2 });
            attempt({ a: 'three' }, schema).to.equal({});
        });

        it('maps value using a Map.', () => {

            const schema = joi.value({
                x: joi.param('a').into(new Map([
                    ['one', 1],
                    ['two', 2]
                ]))
            });

            attempt({ a: 'one' }, schema).to.equal({ x: 1 });
            attempt({ a: 'two' }, schema).to.equal({ x: 2 });
            attempt({ a: 'three' }, schema).to.equal({});
        });

        it('maps value using an object containing defaults, allowing default symbol to override $default.', () => {

            const schema1 = joi.value({
                x: joi.param('a').into({
                    one: 1,
                    two: 2,
                    $default: 0
                })
            });

            attempt({ a: 'three' }, schema1).to.equal({ x: 0 });

            const schema2 = joi.value({
                x: joi.param('a').into({
                    one: 1,
                    two: 2,
                    [joi.default]: 0
                })
            });

            attempt({ a: 'three' }, schema2).to.equal({ x: 0 });

            const schema3 = joi.value({
                x: joi.param('a').into({
                    one: 1,
                    two: 2,
                    $default: 3,
                    [joi.default]: 0
                })
            });

            attempt({ a: 'three' }, schema3).to.equal({ x: 0 });
            attempt({ a: '$default' }, schema3).to.equal({ x: 3 });
        });

        it('maps value using an array with default.', () => {

            const schema = joi.value({
                x: joi.param('a').into([
                    ['one', 1],
                    [joi.default, 2]
                ])
            });

            attempt({ a: 'one' }, schema).to.equal({ x: 1 });
            attempt({ a: 'two' }, schema).to.equal({ x: 2 });
        });


        it('maps value using a Map with default.', () => {

            const schema = joi.value({
                x: joi.param('a').into(new Map([
                    ['one', 1],
                    [joi.default, 2]
                ]))
            });

            attempt({ a: 'one' }, schema).to.equal({ x: 1 });
            attempt({ a: 'two' }, schema).to.equal({ x: 2 });
        });
    });

    it('value() and params() with ref.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            y: joi.param('x'),
            z: {
                w: joi.param('a.b'),
                aa: joi.param('a.c').default(joi.ref('...y'))
            }
        });

        attempt(params, schema).to.equal({
            y: 5,
            z: {
                w: 10,
                aa: 5
            }
        });
    });

    it('value() and param() with intoWhen().', () => {

        const params = { a: 1, b: 'twelve', c: ['s', 'e', 'e'] };
        const schema = joi.value({
            x: joi.param('a').intoWhen({
                is: 1,
                then: joi.value('one'),
                otherwise: joi.value(null)
            }),
            y: {
                z: joi.value('twelve').intoWhen({
                    is: 'twelve',
                    then: joi.param('c'),
                    otherwise: joi.value(null)
                })
            },
            w: joi.array().value([
                'item1',
                joi.param('a').intoWhen({
                    is: 2,
                    then: 'item2',
                    otherwise: joi.strip() // TODO pull this functionality into separate test
                }),
                'item3'
            ])
        });

        attempt(params, schema).to.equal({
            x: 'one',
            y: { z: ['s', 'e', 'e'] },
            w: ['item1', 'item3']
        });
    });
});
