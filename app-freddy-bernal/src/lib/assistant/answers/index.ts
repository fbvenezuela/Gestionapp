// All of 360's answers (types.ts), in one list: everyone's first, then administración and the six roles.
import { ADMIN } from './admin';
import { BOSS } from './boss';
import { CAMERA } from './camera';
import { DISPATCH } from './dispatch';
import { IVT } from './ivt';
import { POLITICS } from './politics';
import { SOCIAL } from './social';
import { TODOS } from './todos';
import type { Answer } from './types';

export type { Answer, AnswerText } from './types';

export const ANSWERS: Answer[] = [...TODOS, ...ADMIN, ...BOSS, ...DISPATCH, ...POLITICS, ...IVT, ...SOCIAL, ...CAMERA];

/** The entries by file, for the content test's messages. */
export const ANSWER_FILES: Record<string, Answer[]> = { todos: TODOS, admin: ADMIN, boss: BOSS, dispatch: DISPATCH, politics: POLITICS, ivt: IVT, social: SOCIAL, camera: CAMERA };
