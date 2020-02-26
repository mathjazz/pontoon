/* @flow */

import { OPEN, RESET } from './actions';

import type { OpenAction, ResetAction } from './actions';


type Action =
    | OpenAction
    | ResetAction
;


export type TranslationCommentState = {|
    +translation: ?number,
|};


const initialState = {
    translation: null,
};

export default function reducer(
    state: TranslationCommentState = initialState,
    action: Action
): TranslationCommentState {
    switch (action.type) {
        case OPEN:
            return {
                ...state,
                translation: action.translation,
            };
        case RESET:
            return {
                ...state,
                translation: null,
            };
        default:
            return state;
    }
}
