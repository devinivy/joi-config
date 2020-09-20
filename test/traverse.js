
'use strict';

// Load modules

const Lab = require('@hapi/lab');
const Code = require('@hapi/code');
const Traverse = require('../lib/traverse');

// Test shortcuts

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;

describe('Traverse', () => {

    describe('findPaths()', () => {

        it('finds paths to leaves through arrays and objects.', () => {

            const obj = {
                a: {
                    b: [
                        0,
                        1,
                        0
                    ],
                    c: 1,
                    d: {
                        e: 0
                    }
                }
            };

            const paths = Traverse.findPaths(obj, (x) => x === 0);

            expect(paths).to.equal([
                ['a', 'd', 'e'],
                ['a', 'b', '2'],
                ['a', 'b', '0']
            ]);
        });

        it('does not traverse into found items.', () => {

            const obj = {
                a: {
                    b: [
                        0,
                        1,
                        0
                    ],
                    c: 1,
                    d: {
                        e: 0
                    }
                }
            };

            const paths = Traverse.findPaths(obj, (x, path) => path.length >= 1);

            expect(paths).to.equal([
                ['a']
            ]);
        });

        it('finds the path to the root item.', () => {

            const obj = {
                a: {
                    b: 'c'
                }
            };

            const paths = Traverse.findPaths(obj, (x) => x && x.a);

            expect(paths).to.equal([
                []
            ]);
        });

        it('finds paths through symbols.', () => {

            const x = Symbol('x');

            const obj = {
                a: { [x]: 'c' },
                b: ['c'],
                c: 'd'
            };

            const paths = Traverse.findPaths(obj, (x) => x === 'c');

            expect(paths).to.equal([
                ['b', '0'],
                ['a', x]
            ]);
        });

        it('does not revisit objects through circular references.', () => {

            const x = Symbol('x');

            const obj = {
                a: {}
            };

            obj.a.x = obj;

            const paths = Traverse.findPaths(obj, (x, path) => x === obj && path.length > 0);

            expect(paths).to.equal([]);
        });
    });

    describe('set()', () => {

        it('sets object items.', () => {

            const obj = { a: 1, b: 2, c: 3 };
            const updated = Traverse.set(obj, 'b', 4);

            expect(updated).to.shallow.equal(obj);
            expect(updated).to.equal({ a: 1, b: 4, c: 3 });
        });

        it('strips object items.', () => {

            const obj = { a: 1, b: 2, c: 3 };
            const updated = Traverse.set(obj, 'b', Traverse.strip);

            expect(updated).to.shallow.equal(obj);
            expect(updated).to.equal({ a: 1, c: 3 });
            expect(updated).to.not.equal({ a: 1, b: undefined, c: 3 });
        });

        it('sets array items.', () => {

            const arr = [1, 2, 3];
            const updated = Traverse.set(arr, 1, 4);

            expect(updated).to.shallow.equal(arr);
            expect(updated).to.equal([1, 4, 3]);
        });

        it('allows specifying string key for arrays.', () => {

            const arr = [1, 2, 3];
            const updated = Traverse.set(arr, '1', 4);

            expect(updated).to.shallow.equal(arr);
            expect(updated).to.equal([1, 4, 3]);
        });

        it('strips array items.', () => {

            const arr = [1, 2, 3];
            const updated = Traverse.set(arr, 1, Traverse.strip);

            expect(updated).to.shallow.equal(arr);
            expect(updated).to.equal([1, 3]);
        });
    });
});
