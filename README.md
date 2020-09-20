# joi-config
Joi extension for building safe configurations

[![Build Status](https://travis-ci.org/devinivy/joi-config.svg?branch=master)](https://travis-ci.org/devinivy/joi-config) [![Coverage Status](https://coveralls.io/repos/devinivy/joi-config/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/joi-config?branch=master)

## Usage
Here are some provisional instructions and examples for now, while things continue to settle.

### Install

```sh
git clone git@github.com:devinivy/joi-config.git
mkdir new-project && cd new-project
npm init
npm install joi
npx shrimport ../joi-config
```

### Usage

```js
const Joi = require('joi')
    .extend(require('joi-config'));
```

### Examples

#### Values

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

You can use params as refs and expressions.  In order to reference params, simply reference the root `Joi.ref('/some.param')` or use the utilities `Joi.pref()` and `Joi.pexpression()` (or `Joi.px()`).

```js
const params = { x: 5, a: { b: 10 } };

Joi.attempt(params, Joi.value({
    x: 1,
    y: {
        z: Joi.pref('x'),
        w: Joi.ref('...x'),
        q: Joi.px('{a.b * 2}'),
        u: Joi.number().value(6).min(Joi.pref('x'))
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
