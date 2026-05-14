/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string
  export default content
}
declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: { workerSrc: string }
  export const Util: { transform(m1: number[], m2: number[]): number[] }
  export function getDocument(params: { data: Uint8Array }): { promise: Promise<unknown> }
}

declare module 'pdfjs-dist/build/pdf.worker.mjs?url' {
  const src: string
  export default src
}
