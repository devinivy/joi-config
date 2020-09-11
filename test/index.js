
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

        expect(joi.attempt('4', joi.number())).to.equal(4);
        expect(joi.attempt({}, joi.number().value(1))).to.equal(1);
        expect(joi.attempt({}, joi.number().value('2'))).to.equal(2);
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
});
