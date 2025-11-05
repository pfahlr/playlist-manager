export type ProblemOptions = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

export type ProblemBody = {
  type: string;
  code: string;
  message: string;
  request_id: string | null;
  details: Record<string, unknown> | null;
};

export function problem(options: ProblemOptions): Error {
  const { status, code, message, details } = options;
  const err: any = new Error(message);
  err.statusCode = status;
  err.code = code;
  if (details !== undefined) {
    err.details = details;
  }
  return err;
}

export function toProblemBody(options: ProblemOptions & { requestId?: string | null }): ProblemBody {
  const { status: _status, code, message, details, requestId } = options;
  return {
    type: 'about:blank',
    code,
    message,
    request_id: requestId ?? null,
    details: details ?? null,
  };
}
