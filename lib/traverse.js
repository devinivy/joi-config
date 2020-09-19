'use strict';

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

        // Includes symbol keys
        for (const key of Reflect.ownKeys(val)) {
            if (!seen.has(val[key])) {
                stack.push([[...path, key], val[key]]);
            }
        }
    }

    return paths;
};

exports.strip = Symbol('strip');

exports.set = (obj, key, value) => {

    if (value === exports.strip) {
        if (Array.isArray(obj)) {
            obj.splice(key, 1);
        }
        else {
            delete obj[key];
        }
    }
    else {
        obj[key] = value;
    }

    return obj;
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
