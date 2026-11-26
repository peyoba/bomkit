#!/usr/bin/env node
/** 构建不能只通过TypeScript却漏发运行时。避免缺wheel或旧源码产物上线。 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(web), assets=path.join(web,'public/pyodide');
const required=['pyodide.mjs','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json',
  'micropip-0.6.0-py3-none-any.whl','packaging-23.2-py3-none-any.whl','et_xmlfile-2.0.0-py3-none-any.whl','openpyxl-3.1.5-py2.py3-none-any.whl','bomcore-manifest.json'];
try {
  for(const name of required) if(!fs.statSync(path.join(assets,name)).size) throw Error('运行时文件为空：'+name);
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'bomcore-manifest.json'),'utf8'));
  if(!/^bomcore-[A-Za-z0-9_.-]+\.whl$/.test(manifest.wheel)) throw Error('引擎清单无效');
  const wheel=path.join(assets,manifest.wheel);const built=fs.statSync(wheel).mtimeMs;
  function sourceTimes(dir) {
    return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>{
      const p=path.join(dir,d.name);
      if(d.isDirectory()) return d.name==='__pycache__'?[]:sourceTimes(p);
      return /\.(py|json)$/.test(d.name)?[fs.statSync(p).mtimeMs]:[];
    });
  }
  if(Math.max(...sourceTimes(path.join(root,'core/src/bomcore'))) > built) throw Error('Python源码更新后尚未重新打包/准备引擎');
  console.log('自托管 Pyodide 与当前 bomcore wheel 已准备');
} catch(error) {
  console.error(String(error));
  console.error('请在仓库根执行 .venv/bin/python -m build --wheel --no-isolation core，然后在 web 执行 npm run prepare:pyodide');
  process.exitCode=1;
}
