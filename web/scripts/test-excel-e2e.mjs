#!/usr/bin/env node
/** 默认Excel流程真实Pyodide回归；不进行网页确认，不替用户批准真实物料。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import * as XLSX from 'xlsx';

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(web);
const privateRoot=path.join(root,'core/tests/fixtures/private');
const output=path.join(privateRoot,'excel-first-e2e');
const inputs=path.join(privateRoot,'closed-loop/inputs');
const baseURL=process.env.BOMKIT_E2E_URL || 'http://127.0.0.1:4173/';
const origin=new URL(baseURL).origin;
const cases=JSON.parse(await fs.readFile(path.join(root,'core/tests/fixtures/excel_legacy_golden.json'),'utf8')).cases;
await fs.mkdir(output,{recursive:true});
const report={baseURL,engine:'Chromium + real Pyodide',mode:'Excel-first',cases:[],external:[],uploads:[],pageErrors:[],runtime:[]};
const runtime=new Set();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin){report.external.push(u.origin+u.pathname);return route.abort();}
  if(!['GET','HEAD'].includes(r.method()))report.uploads.push(r.method()+' '+u.pathname);
  if(u.pathname.startsWith('/pyodide/'))runtime.add(path.basename(u.pathname));
  await route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.pageErrors.push(e.message));
const id=name=>page.locator('[data-testid="'+name+'"]');
function file(name,rows){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'合成表');return {name:name+'.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})};}
async function open(){await page.goto(baseURL);await page.getByRole('button',{name:'开始转换',exact:true}).click();await id('excel-convert').waitFor();}
async function ready(){await page.waitForFunction(()=>{const b=document.querySelector('[data-testid="excel-convert"]');return b&&!b.disabled&&!b.classList.contains('ant-btn-loading');},{},{timeout:120000});}
async function setInput(bom,material,meta,trace){
  await page.locator('#bom-file').setInputFiles(bom);
  await page.locator('#material-file').setInputFiles(material || []);
  for(const [key,label] of [['pcba_name','PCBA名称'],['pcba_model','PCBA型号'],['pcb_name','PCB空板名称'],['pcb_model','PCB空板型号']]) await page.getByLabel(label,{exact:true}).fill(meta[key] || '');
  await page.getByRole('checkbox').setChecked(trace);
  await ready();
}
async function download(name){
  assert.equal(await id('confirm-row').count(),0);
  // Chromium会节流瞬时连续下载；无动画的新UI比旧Ant按钮更快，不应把自动化节流误当转换失败。
  // 独立探针：连续约50ms的第11次被拦截，250ms节奏的13次全部成功。仅测试放慢，不改产品输出。
  await page.waitForTimeout(250);
  const p=page.waitForEvent('download',{timeout:120000});await id('excel-convert').click();const d=await p;
  const target=path.join(output,name+'.xlsx');await d.saveAs(target);assert.equal(await d.failure(),null);
  await id('excel-result').waitFor();
  assert.deepEqual(await page.locator('.ant-alert-error').allTextContents(),[]);
  const w=XLSX.read(await fs.readFile(target),{type:'buffer',cellFormula:true,cellStyles:true});
  assert.ok(!Object.values(w.Sheets).some(sh=>Object.values(sh).some(c=>c&&typeof c==='object'&&c.f)));
  return w;
}
try{
  await open();
  for(const c of cases){
    await setInput(file(c.name,c.bom_rows),c.material_rows?file(c.name+'-materials',c.material_rows):null,c.meta,false);
    const w=await download(c.name);assert.equal(w.SheetNames.length,1);
    const ws=w.Sheets[w.SheetNames[0]];
    for(const [cell,[value]] of Object.entries(c.expected.cells))assert.deepEqual(ws[cell]?.v ?? '',value ?? '',c.name+' '+cell);
    report.cases.push({name:c.name,passed:true,comparison:'legacy main cells',confirmationClicks:0});
  }
  const mixed=cases.find(c=>c.name==='multiple_candidates');
  await setInput(file('trace',mixed.bom_rows),file('trace-material',mixed.material_rows),mixed.meta,true);
  const traced=await download('trace');assert.equal(traced.SheetNames.length,3);
  assert.ok(traced.SheetNames.includes('原始输入')&&traced.SheetNames.includes('Excel校对提示'));
  assert.ok((await page.locator('main').innerText()).includes('不能直接把展示合计用于采购'));
  report.cases.push({name:'optional-trace',passed:true,confirmationClicks:0});
  await page.screenshot({path:path.join(output,'excel-first.png'),fullPage:true});
  if(process.env.BOMKIT_PRIVATE_TESTS==='1'){
    for(const [name,rows,qty] of [['jlc.xlsx',55,171],['altium.xlsx',94,250],['cadence-report.xlsx',309,1004],['cadence-detail.xlsx',76,76],['cadence-grouped.xlsx',33,76],['cadence-grouped.txt',33,76]]){
      await setInput(path.join(inputs,name),path.join(inputs,'material.xlsx'),{pcba_name:'技术自动化验证 · 禁止投产'},true);
      const w=await download('private-'+name.replaceAll('.','-'));assert.equal(w.SheetNames.length,3);
      const summary=await id('excel-stats').innerText();
      assert.ok(summary.includes('原始 '+rows+' 行 / '+qty+' 件'),summary);
      report.cases.push({name,passed:true,sourceRows:rows,sourceQuantity:qty,summary,confirmationClicks:0,businessApproval:false});
    }
  }
  const large=[['Name','Designator','Quantity','Footprint','Device']];
  for(let n=1;n<=5000;n++)large.push(['10kΩ','R'+n,'1','0603','10kΩ/0603']);
  await setInput(file('large',large),file('large-material',[['编码','名称','规格型号'],['001','电阻','10kΩ/0603']]),{pcba_name:'5000行技术验证 · 禁止投产'},true);
  const big=await download('large-5000');const main=big.Sheets[big.SheetNames[0]];
  assert.equal(main.F5.v,5000);assert.equal(main.E5.v.split(',').length,5000);assert.ok(main.E5.v.endsWith('R5000'));
  assert.ok((await id('excel-stats').innerText()).includes('合并为 1 组'));
  report.cases.push({name:'large-5000',passed:true,sourceRows:5000,groups:1,quantity:5000,confirmationClicks:0});
  await page.locator('#bom-file').setInputFiles({name:'broken.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('broken')});
  await page.getByText('不是有效的 XLSX 文件',{exact:true}).waitFor();
  assert.equal(await id('excel-convert').isDisabled(),true);
  report.cases.push({name:'broken-input',passed:true});
  await page.goto(baseURL);await page.getByRole('button',{name:'网页校对（可选）',exact:true}).click();await id('start-review').waitFor();
  report.cases.push({name:'optional-review-retained',passed:true});
  assert.deepEqual(report.external,[]);assert.deepEqual(report.uploads,[]);assert.deepEqual(report.pageErrors,[]);
  assert.ok(runtime.has('pyodide.asm.wasm')&&runtime.has('bomcore-0.1.0-py3-none-any.whl'));
  report.runtime=[...runtime];report.passed=true;
  console.log('Excel-first real Pyodide passed:',report.cases.length,'cases');
}catch(e){
  report.passed=false;report.error=String(e);
  report.uiDiagnostics=await page.evaluate(()=>({text:document.querySelector('main')?.innerText,invalid:[...document.querySelectorAll(':invalid')].map(e=>({tag:e.tagName,type:e.type,id:e.id,message:e.validationMessage})),button:document.querySelector('[data-testid="excel-convert"]')?.outerHTML})).catch(()=>null);
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  throw e;
}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
