
'use strict';

// Load modules

const Lab = require('@hapi/lab');
const Code = require('@hapi/code');
const JoiBase = require('joi');
const JoiConfig = require('..');

// Test shortcuts

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;

describe('JoiConfig', () => {

    const joi = JoiBase.extend(...JoiConfig);

    it('is an extension.', () => {

        expect(joi.attempt({}, joi.value(4))).to.equal(4);
    });

    it('numeric value().', () => {

        expect(joi.attempt({}, joi.number().value(1))).to.equal(1);
        expect(joi.attempt({}, joi.number().value('2'))).to.equal(2);
    });

    it('undefined value().', () => {

        expect(joi.attempt({}, joi.value())).to.equal({}); // Not the ideal behavior, but it comes from joi and is here for documentation.
        expect(joi.attempt({}, joi.any().value())).to.equal(undefined);
        expect(joi.attempt({}, joi.value(undefined))).to.equal(undefined);
        expect(joi.attempt({}, joi.value(undefined).default(7))).to.equal(7);
    });

    it('params().', () => {

        expect(joi.attempt({ x: 5 }, joi.param('x'))).to.equal(5);
    });

    it('params via value() and ref.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            x: 1,
            y: {
                z: joi.value(joi.ref('x', { ancestor: 0 }))
            },
            w: joi.value(joi.ref('a.b', { ancestor: 0 }))
        });

        expect(joi.attempt(params, schema)).to.equal({
            x: 1,
            y: {
                z: 5
            },
            w: 10
        });
    });

    it('value() and params() with ref.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            x: 1,
            y: {
                z: joi.value(joi.ref('/x'))
            }
        });

        expect(joi.attempt(params, schema)).to.equal({
            x: 1,
            y: {
                z: 1
            }
        });
    });

    it('value() with ref.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            x: 1,
            y: {
                z: joi.value(joi.ref('/x')),
                w: joi.value(joi.ref('.x'))
            }
        });

        expect(joi.attempt(params, schema)).to.equal({
            x: 1,
            y: {
                z: 1,
                w: 5
            }
        });
    });

    it('value() with expression.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            x: 1,
            y: {
                z: joi.value(joi.x('{...x + .a.b}'))
            }
        });

        expect(joi.attempt(params, schema)).to.equal({
            x: 1,
            y: {
                z: 11
            }
        });
    });

    it('value() and params() with ref.', () => {

        const params = { x: 5, a: { b: 10 } };
        const schema = joi.value({
            y: joi.param('x'),
            z: {
                w: joi.param('a.b'),
                aa: joi.param('a.c').default(joi.ref('/y'))
            }
        });

        expect(joi.attempt(params, schema)).to.equal({
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

        expect(joi.attempt(params, schema)).to.equal({
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

        expect(joi.attempt(params, schema)).to.equal({
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

        expect(joi.attempt(params, schema)).to.equal({});
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

        expect(joi.attempt(params, schema)).to.equal({
            x: 'two'
        });
    });

    it('compatibility with when()', () => {

        const schema = joi.value({
            x: joi.value('x')
                // TODO consider whenParam() for support of params in
                // NOTE when('.a', ...) also works here
                .when(joi.paramRef('a'), { is: 1, then: joi.strip() })
        });

        expect(joi.attempt({ a: 1 }, schema)).to.equal({});
        expect(joi.attempt({ a: 2 }, schema)).to.equal({ x: 'x' });
    });

    it('into() with object.', () => {

        const schema = joi.value({
            x: joi.param('a').into({
                one: 1,
                two: 2
            })
        });

        expect(joi.attempt({ a: 'one' }, schema)).to.equal({
            x: 1
        });

        expect(joi.attempt({ a: 'two' }, schema)).to.equal({
            x: 2
        });

        expect(joi.attempt({ a: 'three' }, schema)).to.equal({});
    });

    it('into() with object and defaults.', () => {

        const schema1 = joi.value({
            x: joi.param('a').into({
                one: 1,
                two: 2,
                $default: 0
            })
        });

        expect(joi.attempt({ a: 'three' }, schema1)).to.equal({ x: 0 });

        const schema2 = joi.value({
            x: joi.param('a').into({
                one: 1,
                two: 2,
                [joi.default]: 0
            })
        });

        expect(joi.attempt({ a: 'three' }, schema2)).to.equal({ x: 0 });

        const schema3 = joi.value({
            x: joi.param('a').into({
                one: 1,
                two: 2,
                $default: 3,
                [joi.default]: 0
            })
        });

        expect(joi.attempt({ a: 'three' }, schema3)).to.equal({ x: 0 });

        expect(joi.attempt({ a: '$default' }, schema3)).to.equal({ x: 3 });
    });

    it('intoWhen() with paramRef(x, { force: true }).', () => {

        const params = { a: 1, b: 'two', c: 1 };
        const schema = joi.value({
            x: joi.param('a').intoWhen({
                is: joi.paramRef('c', { force: true }),
                then: joi.param('b'),
                otherwise: joi.value(null)
            })
        });

        expect(joi.attempt(params, schema)).to.equal({
            x: 'two'
        });
    });

    it('allows value() with circular reference.', () => {

        // TODO currently fails

        const a = {};
        a.a = a;

        const schema = joi.value(a);

        expect(joi.attempt({}, schema)).to.exist();
    });
});
