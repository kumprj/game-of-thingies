export const MAX_GAME_NAME_LENGTH = 50;
export const MAX_QUESTION_LENGTH = 200;

type Valid = {ok: true; name: string; question: string};
type Invalid = {ok: false; error: string};

/** Checks createGame's body: both fields are required text, trimmed, within their length limits. */
export function validateGameSetup(body: unknown): Valid | Invalid {
  const {name: rawName, question: rawQuestion} = (body ?? {}) as Record<string, unknown>;
  if (typeof rawName !== 'string' || typeof rawQuestion !== 'string') {
    return {ok: false, error: 'Title and question must be text'};
  }
  const name = rawName.trim();
  const question = rawQuestion.trim();
  if (!name) return {ok: false, error: 'Title is required'};
  if (!question) return {ok: false, error: 'Question is required'};
  if (name.length > MAX_GAME_NAME_LENGTH) {
    return {ok: false, error: `Title must be ${MAX_GAME_NAME_LENGTH} characters or fewer`};
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {ok: false, error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`};
  }
  return {ok: true, name, question};
}
