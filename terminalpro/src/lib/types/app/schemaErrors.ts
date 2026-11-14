import type { z } from "zod";

export function unionErrorMap(message: string) {
  return {
    error: (val) => {
      const output = { message: val.message };
      if (val.code === "invalid_union" || val.code === "invalid_value") {
        output.message = message;
      }
      return output;
    },
  } as { error: z.core.$ZodErrorMap };
}
