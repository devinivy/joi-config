# API

[Joi](https://joi.dev/) extension for building airtight configurations

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

> **Hey!**
>
> You've probably noticed this documentation is filled with stubs and could use a lot of love.  Rest assured, the library itself is in a complete state and [is tested to 100% coverage](https://coveralls.io/github/devinivy/joi-config?branch=master).  You can find lots of examples [here in the readme](README.md#examples) as well as [in the tests](test/index.js).  The docs will be completed in the future, but please feel free to lend a hand by opening a PR to expand them.

## Rules

### `any.value(value, [options])`
> Alias: `Joi.value(value, [options])`
### `any.param(param, [options])`
> Alias: `Joi.param(param, [options])`
### `any.whenParam(param, options)`
> Alias: `Joi.whenParam(param, options)`
### `any.intoWhen(options)`
### `any.into(mapper)`

## Utilities

### `Joi.p.ref(key, [options])`
### `Joi.p.in(key, [options])`
### `Joi.p.expression(template, [options])`
> Alias: `Joi.p.x(template, [options])`
### `Joi.default`
