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

  public static parseError(err: any, filePath?: string): { line: number | null; col: number | null } {
    const stack = err.stack || err.message || '';
    
    // Priority 1: Match the specific file path in the stack/message (High Fidelity)
    if (filePath) {
      // Escape path for regex (critical for Windows paths)
      const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathRegex = new RegExp(`${escapedPath}:(\\d+)(?::(\\d+))?`);
      const pathMatch = stack.match(pathRegex);
      if (pathMatch) {
        return {
          line: parseInt(pathMatch[1], 10),
          col: pathMatch[2] ? parseInt(pathMatch[2], 10) : null
        };
      }
    }

    // Priority 2: Fallback to generic coordinate matching (ignores common Node internals)
    const lines = stack.split('\n');
    for (const lineText of lines) {
       // Ignore internal Node.js frames to prevent "Line 117" hallucinations
       if (lineText.includes('node:vm') || lineText.includes('node:internal')) continue;
       
       const match = lineText.match(/[:(](\d+):(\d+)\)?/);
       if (match) {
         return {
           line: parseInt(match[1], 10),
           col: parseInt(match[2], 10)
         };
       }
    }
    
    return { line: null, col: null };
  }
}
