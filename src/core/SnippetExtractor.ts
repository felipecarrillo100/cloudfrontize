import fs from 'fs';

export interface snippetInfo {
  line: number;
  col: number;
  snippet: string;
}

export class SnippetExtractor {
  public static extract(filePath: string, line: number | null): string {
    if (!line || !fs.existsSync(filePath)) return '';
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const start = Math.max(0, line - 2);
      const end = Math.min(lines.length, line + 1);
      
      const snippet = lines.slice(start, end).map((l, i) => {
        const lineNum = start + i + 1;
        const prefix = lineNum === line ? ' > ' : '   ';
        return `${prefix}${lineNum} | ${l}`;
      }).join('\n');
      
      return snippet;
    } catch (err) {
      return '';
    }
  }

  public static parseError(err: any): { line: number | null; col: number | null } {
    // Standard Node.js SyntaxError stack: /path/to/file:L:C
    // Or vm.Script error message: Unexpected token 'x' at (file.js:L:C)
    const stack = err.stack || err.message || '';
    const match = stack.match(/[:(](\d+):(\d+)\)?/);
    
    if (match) {
      return {
        line: parseInt(match[1], 10),
        col: parseInt(match[2], 10)
      };
    }
    
    return { line: null, col: null };
  }
}
