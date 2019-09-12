/* @flow */

import type { PatternElement } from './types';


/**
 * Return true when AST element represents a pluralized string.
 *
 * Keys of all variants of such elements are either CLDR plurals or numbers.
 */
export default function isPluralElement(element: PatternElement): boolean {
    if (
        !(
            element.type === 'Placeable' &&
            element.expression && element.expression.type === 'SelectExpression'
        )
    ) {
        return false;
    }

    const CLDR_PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'];

    return element.expression.variants.every(variant => {
        return (
            CLDR_PLURALS.indexOf(variant.key.name) !== -1 ||
            variant.key.type === 'NumberLiteral'
        );
    });
}
