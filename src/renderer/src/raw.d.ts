// Vite "?raw" imports: the file's text as a string (used for the Help manual)
declare module '*.md?raw' {
  const text: string
  export default text
}
