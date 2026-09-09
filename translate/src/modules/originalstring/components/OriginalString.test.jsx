import React from 'react';

import { EditorActions } from '~/context/Editor';
import { EntityView } from '~/context/EntityView';
import { createReduxStore, mountComponentWithStore } from '~/test/store';

import { OriginalString } from './OriginalString';
import { fireEvent } from '@testing-library/react';

const ENTITY = {
  format: 'fluent',
  key: ['header'],
  value: [],
  properties: { 'page-title': ['Hello\nSimple\nString'] },
};

function mountOriginalString(spy, { entity = ENTITY, terms = {} } = {}) {
  const store = createReduxStore({ user: { isAuthenticated: true } });
  return mountComponentWithStore(
    () => (
      <EntityView.Provider value={{ entity }}>
        <EditorActions.Provider value={{ setEditorSelection: spy }}>
          <OriginalString terms={terms} />
        </EditorActions.Provider>
      </EntityView.Provider>
    ),
    store,
  );
}

function plainEntity(value) {
  return { format: 'plain', key: ['key'], value: [value] };
}

function term(text) {
  return {
    text,
    partOfSpeech: 'noun',
    definition: `Definition of ${text}`,
    usage: '',
    translation: `Translation of ${text}`,
    entityId: 1,
  };
}

describe('<OriginalString>', () => {
  it('renders original input as simple string', () => {
    const { container } = mountOriginalString();

    expect(container.querySelector('.original').textContent).toBe(
      'Hello¶\nSimple¶\nString',
    );
  });

  it('calls the selectTerms function on placeable click', () => {
    const spy = vi.fn();
    const { container } = mountOriginalString(spy);

    fireEvent.click(container.querySelector('.original'));
    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('.original mark'));
    expect(spy).toHaveBeenCalled();
  });

  it('shows the terms popup for a term stored with an uppercase letter', () => {
    const { container } = mountOriginalString(vi.fn(), {
      entity: plainEntity('Report an Issue here.'),
      terms: { fetching: false, terms: [term('Issue')] },
    });

    fireEvent.click(container.querySelector('.original mark.term'));

    const popup = container.querySelector('.terms-popup');
    expect(popup).not.toBeNull();
    expect(popup.querySelector('.text').textContent).toBe('Issue');
  });

  it('shows the terms popup for a lowercase term used capitalized', () => {
    const { container } = mountOriginalString(vi.fn(), {
      entity: plainEntity('Issue reported.'),
      terms: { fetching: false, terms: [term('issue')] },
    });

    fireEvent.click(container.querySelector('.original mark.term'));

    const popup = container.querySelector('.terms-popup');
    expect(popup).not.toBeNull();
    expect(popup.querySelector('.text').textContent).toBe('issue');
  });
});
