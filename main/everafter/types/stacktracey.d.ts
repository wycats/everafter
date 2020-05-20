declare module "stacktracey" {
  type Filter = (path: string) => boolean;

  class StackTracey extends Array<StackTraceyFrame> {
    static readonly isThirdParty: {
      include(filter: Filter): void;
      except(filter: Filter): void;
    };

    static maxColumnWidths: {
      callee: number;
      file: number;
      sourceLine: number;
    };

    static locationsEqual(a: StackTracey, b: StackTracey): boolean;
    static resetCache(): void;

    withSource(index: number | StackTraceyFrame): StackTraceyFrame;
    readonly withSources: StackTracey;
    readonly clean: StackTracey;
    readonly pretty: string;
  }

  // https://github.com/xpl/stacktracey/blob/master/README.md#how-to
  export interface StackTraceyFrame {
    beforeParse: string;
    callee: string;
    calleeShort: string;
    file: string; // e.g. /Users/john/my_project/node_modules/foobar/main.js
    fileRelative: string; // e.g. node_modules/foobar/main.js
    fileShort: string; // e.g. foobar/main.js
    fileName: string; // e.g. main.js
    line: number; // starts from 1
    column: number; // starts from 1

    index: boolean /* true if occured in HTML file at index page    */;
    native: boolean /* true if occured in native browser code        */;
    thirdParty: boolean /* true if occured in library code               */;
    hide: boolean /* true if marked as hidden by "// @hide" tag    */;
    syntaxError: boolean /* true if generated from a SyntaxError instance */;
  }

  export default StackTracey;
}
