'use strict';

const Hoek = require('hoek');

exports.findPaths = (value, predicate) => {

    const seen = new Set();
    const paths = [];
    const stack = [[[], value]];

    while (stack.length) {
        const [path, val] = stack.pop();

        if (predicate(val, path)) {
            paths.push(path);
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

    return paths;
};

exports.setShallow = (obj, unrootedPath, value, clones = new Set()) => {

    const path = ['root', ...unrootedPath];
    const lastKey = path.pop();
    const result = { root: obj };

    let it = result;

    for (const key of path) {
        if (!clones.has(it[key])) {
            it[key] = Hoek.clone(item, { shallow: true });
            clones.add(item);
        }
        it = it[key];
    }

    it[lastKey] = value;

    return result.root;
};

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
