declare module 'pg-format' {
  const format: (fmt: string, ...args: unknown[]) => string;
  export default format;
}
