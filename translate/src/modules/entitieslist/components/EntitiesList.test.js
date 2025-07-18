import { createMemoryHistory } from 'history';
import { mockAllIsIntersecting } from 'react-intersection-observer/test-utils';
import sinon from 'sinon';

import * as BatchActions from '~/modules/batchactions/actions';
import * as EntitiesActions from '~/modules/entities/actions';

import {
  createDefaultUser,
  createReduxStore,
  mountComponentWithStore,
} from '~/test/store';

import { EntitiesList } from './EntitiesList';

// Entities shared between tests
const ENTITIES = [
  { pk: 1, translation: { string: '', errors: [], warnings: [] } },
  { pk: 2, translation: { string: '', errors: [], warnings: [] } },
];

describe('<EntitiesList>', () => {
  beforeAll(() => {
    sinon.stub(BatchActions, 'resetSelection').returns({ type: 'whatever' });
    sinon.stub(BatchActions, 'toggleSelection').returns({ type: 'whatever' });
    sinon.stub(EntitiesActions, 'getEntities').returns({ type: 'whatever' });
  });

  beforeEach(() => {
    // Make sure tests do not pollute one another.
    BatchActions.resetSelection.resetHistory();
    BatchActions.toggleSelection.resetHistory();
    EntitiesActions.getEntities.resetHistory();
    mockAllIsIntersecting(true);
  });

  afterAll(() => {
    BatchActions.resetSelection.restore();
    BatchActions.toggleSelection.restore();
    EntitiesActions.getEntities.restore();
  });

  it('shows a loading animation when there are more entities to load', () => {
    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: true,
    });
    const wrapper = mountComponentWithStore(EntitiesList, store);

    expect(wrapper.find('SkeletonLoader')).toHaveLength(1);
  });

  it("doesn't display a loading animation when there aren't entities to load", () => {
    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: false,
    });
    const wrapper = mountComponentWithStore(EntitiesList, store);

    expect(wrapper.find('SkeletonLoader')).toHaveLength(0);
  });

  it('shows a loading animation when entities are being fetched from the server', () => {
    const store = createReduxStore();
    store.dispatch({ type: EntitiesActions.REQUEST_ENTITIES });
    const wrapper = mountComponentWithStore(EntitiesList, store);

    expect(wrapper.find('SkeletonLoader')).toHaveLength(1);
  });

  it('shows the correct number of entities', () => {
    const history = createMemoryHistory({
      initialEntries: ['/kg/firefox/all-resources/?string=1'],
    });

    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: false,
    });
    const wrapper = mountComponentWithStore(EntitiesList, store, {}, history);

    expect(wrapper.find('Entity')).toHaveLength(2);
  });

  it('when requesting new entities, load page 2', () => {
    jest.useFakeTimers();
    mockAllIsIntersecting(false);

    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: true,
    });
    mountComponentWithStore(EntitiesList, store);

    mockAllIsIntersecting(true);
    jest.advanceTimersByTime(100); // default value for react-infinite-scroll-hook delayInMs

    expect(EntitiesActions.getEntities.args[0][1]).toEqual(2);
  });

  it('redirects to the first entity when none is selected', () => {
    const history = createMemoryHistory({
      initialEntries: ['/kg/firefox/all-resources/'],
    });
    const spy = sinon.spy();
    history.listen(spy);

    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: false,
    });

    mountComponentWithStore(EntitiesList, store, {}, history);

    expect(spy.calledOnce).toBeTruthy();
    const [location, action] = spy.firstCall.args;
    expect(action).toBe('REPLACE');
    expect(location).toMatchObject({
      pathname: '/kg/firefox/all-resources/',
      search: '?string=1',
      hash: '',
    });
  });

  it('toggles entity for batch editing', () => {
    const store = createReduxStore();
    store.dispatch({
      type: EntitiesActions.RECEIVE_ENTITIES,
      entities: ENTITIES,
      hasMore: false,
    });

    // HACK to get isTranslator === true in Entity
    createDefaultUser(store, { can_translate_locales: [''] });

    const wrapper = mountComponentWithStore(EntitiesList, store);

    wrapper.find('.entity .status').first().simulate('click');

    expect(BatchActions.toggleSelection.calledOnce).toBeTruthy();
  });
});
