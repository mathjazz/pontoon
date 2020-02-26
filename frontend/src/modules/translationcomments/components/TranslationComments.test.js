import React from 'react';
import { shallow } from 'enzyme';

import TranslationComments from './TranslationComments';

describe('<TranslationComments>', () => {
    const DEFAULT_USER = 'Ari-Pekka Nikkola';

    it('renders correctly when there are comments', () => {
        const entity = {
            format: 'format',
        };
        const locale = {
            dir: 'dir',
            lang: 'lang',
        };
        const translation = {
            comments: [
                { id: 1 },
                { id: 2 },
                { id: 3 },
            ]
        };

        const wrapper = shallow(
            <TranslationComments
                entity={ entity }
                locale={ locale }
                translation={ translation }
                user={ DEFAULT_USER }
            />
        );

        expect(wrapper.children()).toHaveLength(3);
    });
});
