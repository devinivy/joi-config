'use strict';

const Hoek = require('@hapi/hoek');

// Should return paths in an order such that paths to children always come before their parents.
// TODO or perhaps we need to rethink refs altogether

exports.findPaths = (value, predicate) => {

    const seen = new Set();
    const paths = [];
    const stack = [[[], value]];

    while (stack.length) {
        const [path, val] = stack.pop();

        if (predicate(val, path)) {
            paths.push(path);
            continue;
        }

        if (!val || typeof val !== 'object') {
            continue;
        }

        seen.add(val);

        for (const key of Reflect.ownKeys(val)) {
            if (!seen.has(val[key])) {
                stack.push([[...path, key], val[key]]);
            }
        }
    }

    return paths.reverse();
};

exports.strip = Symbol('strip');

exports.setShallow = (obj, unrootedPath, value, clones = new Set()) => {

    const path = ['root', ...unrootedPath];
    const lastKey = path.pop();
    const result = { root: obj };

    let it = result;

    for (const key of path) {

        if (!clones.has(it[key])) {
            it[key] = Hoek.clone(it[key], { shallow: true });
            clones.add(it[key]);
        }

        it = it[key];
    }

    if (value === exports.strip) {
        if (Array.isArray(it)) {
            it.splice(lastKey, 1);
        }
        else {
            delete it[lastKey];
        }
    }
    else {
        it[lastKey] = value;
    }

    return result.root;
};

// For tests:
// exports.findPaths({
//     a: {
//         b: [
//             0,
//             1,
//             0
//         ],
//         c: 1,
//         d: {
//             e: 0
//         }
//     }
// });
