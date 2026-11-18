// All of 360's answers (types.ts), in one list: everyone's first, then administración, the six roles, and what the boss
// and administración ask about «Web» and «Atención» (the long tail the web's guide does not answer by itself).
import { ADMIN } from './admin';
import { ATENCION } from './atencion';
import { BOSS } from './boss';
import { CAMERA } from './camera';
import { DISPATCH } from './dispatch';
import { IVT } from './ivt';
import { POLITICS } from './politics';
import { SOCIAL } from './social';
import { TODOS } from './todos';
import { WEB } from './web';
import type { Answer } from './types';

export type { Answer, AnswerText } from './types';

export const ANSWERS: Answer[] = [...TODOS, ...ADMIN, ...BOSS, ...DISPATCH, ...POLITICS, ...IVT, ...SOCIAL, ...CAMERA, ...WEB, ...ATENCION];

/** The entries by file, for the content test's messages. */
export const ANSWER_FILES: Record<string, Answer[]> = { todos: TODOS, admin: ADMIN, boss: BOSS, dispatch: DISPATCH, politics: POLITICS, ivt: IVT, social: SOCIAL, camera: CAMERA, web: WEB, atencion: ATENCION };
