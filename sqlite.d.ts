declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean });
    prepare(sql: string): Statement;
    close(): void;
  }

  export class Statement {
    run(...params: (string | number | bigint | null)[]): {
      lastInsertRowid: bigint;
      changes: number;
    };
    get(
      ...params: (string | number | bigint | null)[]
    ): Record<string, string | number | bigint | null> | undefined;
    all(
      ...params: (string | number | bigint | null)[]
    ): Record<string, string | number | bigint | null>[];
  }
}
