(function initFinanceState(global) {
  "use strict";

  function createStore(initialState) {
    let state = initialState;
    const listeners = new Set();

    function getState() {
      return state;
    }

    function setState(nextState) {
      state = nextState;
      listeners.forEach((listener) => listener(state));
    }

    function patchState(partial) {
      setState({ ...state, ...partial });
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return { getState, setState, patchState, subscribe };
  }

  global.FinanceState = {
    createStore
  };
})(window);
