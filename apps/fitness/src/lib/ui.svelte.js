/* ═══════════════ UI STATE: TOAST + WEIGHT MODAL + SET LOG SHEET ═══════════════ */
import { parseRepsTarget } from './session.js';
import { intensityFromReps, DEFAULT_BAR_LBS } from './tools/calculators.js';
import { S, displayWeight } from './state.svelte.js';

export const toastState = $state({ msg: '', show: false });

let toastTimer = null;
export function toast(msg) {
  toastState.msg = msg;
  toastState.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState.show = false;
  }, 1800);
}

export const weightModal = $state({
  open: false,
  dayId: null,
  exId: null,
  ex: null
});

export function openWeightModal(dayId, ex) {
  weightModal.dayId = dayId;
  weightModal.exId = ex.id;
  weightModal.ex = ex;
  weightModal.open = true;
}

export function closeWeightModal() {
  weightModal.open = false;
  weightModal.ex = null;
  weightModal.exId = null;
  weightModal.dayId = null;
}

export const setLogSheet = $state({
  open: false,
  dayId: null,
  ex: null,
  setIndex: 1,
  reps: 8,
  rir: 2,
  onConfirm: null,
  onSkip: null
});

export function openSetLogSheet({ dayId, ex, setIndex, onConfirm, onSkip }) {
  const { mid } = parseRepsTarget(ex.reps);
  setLogSheet.dayId = dayId;
  setLogSheet.ex = ex;
  setLogSheet.setIndex = setIndex;
  setLogSheet.reps = mid;
  setLogSheet.rir = 2;
  setLogSheet.onConfirm = onConfirm;
  setLogSheet.onSkip = onSkip;
  setLogSheet.open = true;
}

export function closeSetLogSheet() {
  setLogSheet.open = false;
  setLogSheet.ex = null;
  setLogSheet.onConfirm = null;
  setLogSheet.onSkip = null;
}

export const skipModal = $state({
  open: false,
  dayId: null,
  ex: null,
  reason: 'equipment',
  substituteId: null,
  onConfirm: null
});

export function openSkipModal({ dayId, ex, onConfirm }) {
  skipModal.dayId = dayId;
  skipModal.ex = ex;
  skipModal.reason = 'equipment';
  skipModal.substituteId = null;
  skipModal.onConfirm = onConfirm;
  skipModal.open = true;
}

export function closeSkipModal() {
  skipModal.open = false;
  skipModal.ex = null;
  skipModal.onConfirm = null;
}

export const knowledgeSheet = $state({
  open: false,
  entryId: null
});

/** @param {string} entryId */
export function openKnowledgeSheet(entryId) {
  knowledgeSheet.entryId = entryId;
  knowledgeSheet.open = true;
}

export function closeKnowledgeSheet() {
  knowledgeSheet.open = false;
  knowledgeSheet.entryId = null;
}

export const fitnessToolSheet = $state({
  open: false,
  tab: '1rm',
  rmWeight: 135,
  rmReps: 8,
  plateTarget: 225,
  plateBar: DEFAULT_BAR_LBS,
  plateUnit: 'lbs',
  plateSides: 2,
  volSets: 4,
  volReps: 10,
  volWeight: 100,
  restIntensity: 'hypertrophy',
  fromFocus: false,
  exName: null,
  ex: null
});

/**
 * @param {{ tab?: '1rm' | 'plates' | 'rest'; weight?: number | null; reps?: number | null; sets?: number | null; targetWeight?: number | null; barWeight?: number; plateSides?: 1 | 2; intensity?: string; ex?: { reps?: string; sets?: number } | null }} opts
 */
export function openFitnessToolSheet(opts = {}) {
  const ex = opts.ex;
  const { mid } = ex?.reps ? parseRepsTarget(ex.reps) : { mid: opts.reps ?? 8 };
  const weight = opts.weight ?? 135;
  const lbs = opts.targetWeight ?? weight;
  const unit = opts.plateUnit ?? (S.settings.unit === 'kg' ? 'kg' : 'lbs');
  fitnessToolSheet.tab = opts.tab ?? '1rm';
  fitnessToolSheet.rmWeight = weight;
  fitnessToolSheet.rmReps = opts.reps ?? mid;
  fitnessToolSheet.plateUnit = unit;
  fitnessToolSheet.plateTarget = lbs != null ? (unit === 'kg' ? displayWeight(lbs) : lbs) : 225;
  fitnessToolSheet.plateBar = opts.barWeight ?? (unit === 'kg' ? 20 : DEFAULT_BAR_LBS);
  fitnessToolSheet.plateSides = opts.plateSides ?? 2;
  fitnessToolSheet.volSets = opts.sets ?? ex?.sets ?? 4;
  fitnessToolSheet.volReps = opts.reps ?? mid;
  fitnessToolSheet.volWeight = weight;
  fitnessToolSheet.restIntensity =
    opts.intensity ?? (ex?.reps ? intensityFromReps(ex.reps) : 'hypertrophy');
  fitnessToolSheet.fromFocus = opts.fromFocus ?? false;
  fitnessToolSheet.exName = opts.ex?.name ?? null;
  fitnessToolSheet.ex = opts.ex ?? null;
  fitnessToolSheet.open = true;
}

export function closeFitnessToolSheet() {
  fitnessToolSheet.open = false;
}
