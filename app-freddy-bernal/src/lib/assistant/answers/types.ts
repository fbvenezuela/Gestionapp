// 360's answers (the questions people ask, as they ask them): one entry per thing someone may want to know, with the
// ways it is asked and the answer, for each role that asks it. The demo brain answers with the best entry; with a model
// chain, the best ones go into the prompt as fichas. The role guides (src/lib/guides) feed the same index on their own
// (their sections, tasks, questions, «Para todos», flows and the admin guide); these entries add what the guides do not
// say in the words people use. Data only: no React, no database. tests/unit/assistant-answers-content.test.ts checks them.
import type { Role } from '../../roles';

// One answer for everyone, or one per role that asks it (`default` for the rest): the boss is told «Tú…», Redes «Eso lo
// hace el jefe…». A role key needs that role among `roles` (or `roles: null`).
export type AnswerText = string | (Partial<Record<Role, string>> & { default?: string });

export type Answer = {
  id: string; // ^[a-z0-9-]{3,60}$, unique among all the entries
  // Who it is for (null = everyone on the team and administración). It never gives a permission: the database decides.
  roles: Role[] | null;
  // At least three ways it is asked, written as people say or dictate them (accents and question marks do not matter).
  q: string[];
  // Two or three plain sentences, ≤ 480 letters each text, with the screen's labels in «» (they must exist on a
  // screen). No concrete date, time, address or phone; no demo names. Huecos: [ASISTENTE], [APP], [JEFE], [NOMBRE].
  a: AnswerText;
  go?: string; // a SCREENS href for the «Ir a…» button; shown only to whoever can open it
  tutorial?: string; // a tour id (src/lib/guides/tours.ts); offered only to whoever has it
};
