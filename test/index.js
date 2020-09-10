
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

    it('params().', () => {

        expect(joi.attempt({ x: 5 }, joi.param('x'))).to.equal(5);
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
