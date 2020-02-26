/* @flow */


export const OPEN: 'comments/OPEN' = 'comments/OPEN';
export const RESET: 'comments/RESET' = 'comments/RESET';


export type OpenAction = {|
    +type: typeof OPEN,
    +translation: number,
|};
export function open(
    translation: number,
): OpenAction {
    return {
        type: OPEN,
        translation,
    };
}


export type ResetAction = {|
    +type: typeof RESET,
|};
export function reset(): ResetAction {
    return {
        type: RESET,
    };
}


export default {
    open,
    reset,
};
