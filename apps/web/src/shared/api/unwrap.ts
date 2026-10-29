export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface TreatyResponse {
  data: unknown;
  error: unknown;
  status: number;
}

const errorMessage = (error: unknown): string | undefined => {
  const value = (error as { value?: unknown } | null)?.value;
  return (value as { error?: { message?: string } } | null)?.error?.message;
};

export const unwrap = <T extends TreatyResponse>(
  response: T
): NonNullable<T["data"]> => {
  if (response.error) {
    throw new ApiError(
      response.status,
      errorMessage(response.error) ?? "Request failed"
    );
  }
  return response.data as NonNullable<T["data"]>;
};
