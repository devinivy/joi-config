
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

        });
    });

    describe('p.in()', () => {

        it('resolves to input parameter in rules that accept in-references.', () => {

        });

        it('accepts ref options.', () => {

        });
    });

    describe('p.expression() (and p.x())', () => {

        it('evaluates using input parameters in value().', () => {

        });

        it('evaluates using input parameters in rules that accept an expression.', () => {

        });

        it('evaluates using input parameters in when().', () => {

        });

        it('accepts expression options.', () => {

        });

        it('is aliased to p.x().', () => {

        });
    });

    describe('whenParam()', () => {});
    describe('intoWhen()', () => {});
    describe('into() (and default)', () => {});

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

    it('intoWhen() passes through prepared value.', () => {

        const params = { a: 1 };
        const schema = joi.value({
            x: joi.param('a').intoWhen({
                is: 2,
                then: joi.value('two'),
                otherwise: joi.any()
            })
        });

        attempt(params, schema).to.equal({
            x: 1
        });
    });

    it('intoWhen() strips when case is missing.', () => {

        const params = { a: 1 };
        const schema = joi.value({
            x: joi.param('a').intoWhen({
                is: 2,
                then: joi.value('two')
            })
        });

        attempt(params, schema).to.equal({});
    });

    it('intoWhen() with default().', () => {

        const params = { a: 2 };
        const schema = joi.value({
            x: joi.param('a').default('two').intoWhen({
                is: 1,
                then: joi.value('one'),
                otherwise: joi.strip()
            })
        });

        attempt(params, schema).to.equal({
            x: 'two'
        });
    });

    it('compatibility with when()', () => {

        const schema = joi.value({
            x: joi.value('x')
                .when(joi.ref('/a'), { is: 1, then: joi.strip() })
        });

        attempt({ a: 1 }, schema).to.equal({});
        attempt({ a: 2 }, schema).to.equal({ x: 'x' });
    });

    it('into() with object.', () => {

        const schema = joi.value({
            x: joi.param('a').into({
                one: 1,
                two: 2
            })
        });

        attempt({ a: 'one' }, schema).to.equal({
            x: 1
        });

        attempt({ a: 'two' }, schema).to.equal({
            x: 2
        });

        attempt({ a: 'three' }, schema).to.equal({});
    });

    it('into() with object and defaults.', () => {

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

    it('intoWhen() with ref in { is }.', () => {

        const params = { a: 1, b: 'two', c: 1 };
        const schema = joi.value({
            x: joi.param('a').intoWhen({
                is: joi.ref('/c'),
                then: joi.param('b'),
                otherwise: joi.value(null)
            })
        });

        attempt(params, schema).to.equal({
            x: 'two'
        });
    });

    it('intoWhen() with empty value.', () => {

        const params = {};
        const schema = joi.param('ernnt').intoWhen({
            is: joi.number(),
            then: joi.value(false),
            otherwise: joi.value(true)
        });

        attempt(params, schema).to.equal(true);
    });

    it('allows refs in standard rules.', () => {

        const schema = joi.value({
            x: joi.number().min(joi.ref('/min')).value(11)
        });

        attempt({ min: 10 }, schema).to.equal({ x: 11 });
        expect(() => joi.attempt({ min: 12 }, schema)).to.throw('"x" must be greater than or equal to ref:root:min');
    });

    it('whenParam() conditionally strips array items.', () => {

        const schema = joi.value([
            1,
            joi.value(2)
                .whenParam('x', { is: 1, then: joi.strip() }),
            3
        ]);

        attempt({ x: 1 }, schema).to.equal([1, 3]);
        attempt({ x: 0 }, schema).to.equal([1, 2, 3]);
    });

    it('whenParam() conditionally strips object items.', () => {

        const schema = joi.value({
            x: 1,
            y: joi.value(2)
                .whenParam('x', { is: 1, then: joi.strip() }),
            z: 3
        });

        attempt({ x: 1 }, schema).to.equal({ x: 1, z: 3 });
        attempt({ x: 0 }, schema).to.equal({ x: 1, y: 2, z: 3 });
    });
});
