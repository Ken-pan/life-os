import { S } from './state.svelte.js';
import { buildTaskIndex } from './domain/taskIndex.js';

/** @returns {import('./domain/taskIndex.js').TaskIndex} */
export function taskIndex() {
  return buildTaskIndex(S.tasks);
}
