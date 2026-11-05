declare module 'jsfive' {
  export class File {
    constructor(buffer: ArrayBuffer, name?: string);
    keys: string[];
    get(path: string): any;
  }
}
