import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['**/node_modules/**','**/dist/**','**/.expo/**','**/coverage/**']},js.configs.recommended,...ts.configs.recommended,{rules:{'@typescript-eslint/no-explicit-any':'error'}},{files:['**/*.js','**/*.cjs'],languageOptions:{globals:{module:'readonly',require:'readonly',process:'readonly',__dirname:'readonly'}}});
