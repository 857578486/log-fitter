/// <reference types="vite/client" />

declare module '*.css?raw' {
  const content: string
  export default content
}

declare module '*.log?raw' {
  const content: string
  export default content
}
