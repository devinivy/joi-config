# joi-config
[Joi](https://joi.dev/) extension for building airtight configurations

[![Build Status](https://travis-ci.org/devinivy/joi-config.svg?branch=master)](https://travis-ci.org/devinivy/joi-config) [![Coverage Status](https://coveralls.io/repos/devinivy/joi-config/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/joi-config?branch=master)

## Usage
> See also the [API Reference](API.md)

The idea behind joi-config is to make it easy to build dynamic configurations using Joi's expressiveness and validation.

```js
const Joi = require('joi')
    .extend(require('joi-config'));

// Returns a validated configuration based on the contents of process.env

Joi.attempt(process.env, Joi.value({
    server: {
        host: 'localhost',
        port: Joi.number().param('PORT').max(65535).default(3000),
    },
    register: {
        plugins: [
            { plugin: '../lib' },
            Joi.value({ plugin: 'hpal-debug' })
                .whenParam('NODE_ENV', { is: 'production', then: Joi.strip() })
        ]
    }
}));
```

### Examples

#### Values

Being able to colocate values and validation is a fundamental idea of joi-config.  It all starts with `value()`, but things continue to get a lot more interesting if you read on!

```js
// The input is not relevant for plain values,
// but will be relevant in later examples that use params.
const input = {};

// Implicit any() base type
Joi.attempt(input, Joi.value('88')); // Returns '88'

// Use number() base type for further validation (and in turn, Joi.number()'s type coercion)
Joi.attempt(input, Joi.number().value('88')); // Returns 88 as a number

// Objects and arrays work
Joi.attempt(input, Joi.value({ a: 'x' })); // Returns { a: 'x' }

// Nested values also work
Joi.attempt(input, Joi.value({ // Returns { a: 88 }
    a: Joi.number().value('88')
}));
```

#### Params

Params are also `value()`s, but they reference the validation input.

```js
const params = {
    colors: {
        blue: '#6495ED', // Cornflower blue
        pink: '#DA70D6'  // Orchid pink
    },
    fontSizes: { // Pixels
        small: 10,
        large: 22
    }
};

Joi.attempt(params, Joi.value({
    header: {
        fontColor: Joi.param('colors.blue'),
        backgroundColor: '#FFFFFF', // Just ensure this is always white
        fontSize: Joi.number().param('fontSizes.large').min(16),
    },
    callToAction: {
        fontColor: Joi.param('colors.black').default('#000000'),
        backgroundColor: Joi.param('colors.pink'),
        fontSize: Joi.number().param('fontSizes.small').max(14)
    }
}));

// Returns {
//     header: {
//         fontColor: '#6495ED',
//         backgroundColor: '#FFFFFF',
//         fontSize: 22
//      },
//     callToAction: {
//         fontColor: '#000000',
//         backgroundColor: '#DA70D6',
//         fontSize: 10
//      }
// }
```

#### Mapping values

You can also map values into new values. Under the hood it uses joi's `when()`,
and you can even use the lower-level `intoWhen()` method to unlock `when()`'s full expressiveness.

```js
Joi.attempt(process.env, Joi.value({
    server: {
        host: 'localhost',
        port: Joi.number().param('PORT').default(3000),
        debug: Joi.param('NODE_ENV').into({
            production: {
                request: ['implementation']
            },
            $default: { // You can also use the symbol Joi.default to avoid key conflicts
                log: ['error'],
                request: ['error']
            }
        })
    },
    register: {
        plugins: [
            {
                plugin: '../lib', // Main plugin
                options: {}
            },
            Joi.value({ plugin: 'hpal-debug' })
                .whenParam('NODE_ENV', { is: 'production', then: Joi.strip() })
        ]
    }
}));
```

#### References

You can use params as refs and expressions.  In order to reference params, simply reference the root `Joi.ref('/some.param')` or use the utilities `Joi.p.ref()` and `Joi.p.expression()` (or `Joi.p.x()`).

```js
const params = { x: 5, a: { b: 10 } };

Joi.attempt(params, Joi.value({
    x: 1,
    y: {
        z: Joi.p.ref('x'),
        w: Joi.ref('...x'),
        q: Joi.p.x('{a.b * 2}'),
        u: Joi.number().value(6).min(Joi.p.ref('x'))
    }
}));

// Returns {
//     x: 1,
//     y: {
//         z: 5,
//         w: 1,
//         q: 20,
//         u: 6
//     }
// }
```
