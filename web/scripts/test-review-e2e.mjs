#!/usr/bin/env node
/** 真实 Chromium + 自托管 Pyodide 回归。人工确认的自动化模拟仅用合成数据。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import * as XLSX from 'xlsx';

const webRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root=path.join(path.dirname(webRoot),'core/tests/fixtures/private/closed-loop');
const output=path.join(root,'outputs/e2e'), inputs=path.join(root,'inputs');
const baseURL=process.env.BOMKIT_E2E_URL || 'http://127.0.0.1:4173/';
const origin=new URL(baseURL).origin;
await fs.mkdir(output,{recursive:true});
const report={engine:'Chromium + real Pyodide',baseURL,syntheticConfirmationOnly:true,cases:[],external:[],uploads:[],runtime:[]};
const runtime=new Set(), errors=[];
const browser=await chromium.launch({headless:process.env.BOMKIT_HEADED!=='1'});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
await context.route('**/*',async route=>{
  const request=route.request(), url=new URL(request.url());
  if (!['data:','blob:'].includes(url.protocol) && url.origin!==origin) {report.external.push(url.origin+url.pathname);return route.abort();}
  if (!['GET','HEAD'].includes(request.method())) report.uploads.push(request.method()+' '+url.pathname);
  if(url.pathname.startsWith('/pyodide/')) runtime.add(path.basename(url.pathname));
  await route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>errors.push(e.message));
const id=name=>page.locator('[data-testid="'+name+'"]');
const modal=page.locator('.ant-modal');
async function enabled(name) {await page.waitForFunction(s=>{const e=document.querySelector(s);return e&&!e.disabled;},'[data-testid="'+name+'"]',{timeout:120000});}
async function reset() {await page.getByRole('button',{name:'重新导入（清空确认）',exact:true}).click();await page.locator('#bom-file').waitFor();}
function fixture(name,rows) {const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'合成表');return {name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})};}
async function start(bom,material,template,rows,quantity,pending=null) {
  await page.locator('#bom-file').setInputFiles(bom);
  if(material) await page.locator('#material-file').setInputFiles(material);
  await id('template-file').setInputFiles(template || []);
  await page.getByLabel('输出标题',{exact:true}).fill('自动化技术验证 · 禁止投产');
  await enabled('start-review');await id('start-review').click();await id('row-summary').waitFor({timeout:120000});
  assert.equal(await id('row-summary').innerText(),rows+' 行 / 数量合计 '+quantity);
  if(pending!==null) {
    assert.equal(await id('pending-summary').innerText(),'需确认 '+pending);
    assert.equal(await id('export-final').isDisabled(),pending>0);
  }
  assert.deepEqual(await page.locator('.ant-alert-error').allTextContents(),[]);
}
async function download(button,name,count,total) {
  const promise=page.waitForEvent('download',{timeout:60000});await id(button).click();const file=await promise;
  const target=path.join(output,name);await file.saveAs(target);assert.equal(await file.failure(),null);
  const w=XLSX.read(await fs.readFile(target),{type:'buffer',cellFormula:true});
  assert.equal(w.SheetNames.length,3);assert.ok(w.SheetNames.includes('校对记录')&&w.SheetNames.includes('原始输入'));
  for(const sh of Object.values(w.Sheets)) assert.ok(!Object.values(sh).some(c=>c&&typeof c==='object'&&c.f),'不应出现公式');
  const all=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,defval:''});
  const headerIndex=all.findIndex(r=>r.includes('数量')&&r.includes('位号'));
  assert.ok(headerIndex>=0);const header=all[headerIndex],rows=all.slice(headerIndex+1);
  assert.equal(rows.length,count);assert.equal(rows.reduce((sum,r)=>sum+Number(r[header.indexOf('数量')]),0),total);
  return {w,header,rows};
}
try {
  await page.goto(baseURL);await page.getByRole('button',{name:'网页校对（可选）',exact:true}).click();
  const bom=fixture('synthetic-jlc.xlsx',[
    ['Designator','Quantity','Name','Device','Footprint','Comment'],
    ['R1','1','10kΩ','SYNTHETIC-MODEL-A','0603',''],
    ['U1','1','SYNTHETIC-UNKNOWN','SYNTHETIC-UNKNOWN','QFN16',''],
    ['R2','1','10kΩ','SYNTHETIC-MODEL-A','0805',''],
  ]);
  const materials=fixture('synthetic-material.xlsx',[
    ['编码','名称','规格型号','禁用状态','封装'],
    ['01.000001','合成电阻','SYNTHETIC-MODEL-A/0603','否','0603'],
    ['09.000002','搜索测试件','SYNTHETIC-ALTERNATIVE','否','QFN16'],
    ['01.999999','已禁用','SYNTHETIC-UNKNOWN','是','QFN16'],
  ]);
  const template=fixture('synthetic-template.xlsx',[
    ['旧项目标题'],['序号','名称','数量','位号','型号','封装','物料编码','需求8'],
    [1,'旧明细',100,'OLD1','OLD-MODEL','OLD-PACKAGE','OLD-CODE',800],['旧页脚'],
  ]);
  await start(bom,materials,template,3,3,2);
  assert.equal(await id('automatic-summary').innerText(),'无需人工确认 1');
  assert.equal(await id('review-row-0').count(),0,'确定项默认不进入问题列表');
  assert.ok((await page.locator('main').innerText()).includes('封装不一致'));
  await page.screenshot({path:path.join(output,'synthetic-problems.png'),fullPage:true,animations:'disabled'});
  const draft=await download('export-draft','synthetic-draft.xlsx',3,3);
  assert.ok(!JSON.stringify(draft.w.Sheets[draft.w.SheetNames[0]]).includes('OLD-MODEL'));
  assert.equal(draft.rows[0][draft.header.indexOf('校对状态')],'','确定项不标注');
  await id('review-row-2').click();await modal.waitFor();
  assert.equal(await id('confirm-row').isDisabled(),true);
  assert.ok((await modal.innerText()).includes('封装不一致'));
  assert.ok((await modal.innerText()).includes('0805'));
  assert.ok((await modal.innerText()).includes('0603'));
  await modal.getByLabel('校对人',{exact:true}).fill('自动化模拟校对员');
  await modal.getByLabel('校对说明',{exact:true}).fill('仅合成数据技术测试');
  await modal.getByRole('checkbox').check();
  await modal.screenshot({path:path.join(output,'synthetic-problem-detail.png'),animations:'disabled'});
  await id('confirm-row').click();await modal.waitFor({state:'hidden'});
  assert.equal(await id('pending-summary').innerText(),'需确认 1');
  assert.equal(await id('review-row-2').count(),0,'已处理项退出问题列表');
  await id('review-row-1').click();await modal.waitFor();
  await modal.getByLabel('搜索物料库',{exact:true}).fill('SYNTHETIC-ALTERNATIVE');
  await modal.getByLabel('搜索物料库',{exact:true}).press('Enter');
  await modal.getByText('搜索到 1 条（显示前 30 条）',{exact:true}).waitFor();
  await modal.getByLabel('物料候选',{exact:true}).click();
  await page.locator('.ant-select-item-option').filter({hasText:'09.000002'}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="最终物料编码"]')?.value==='09.000002');
  await modal.getByLabel('校对说明',{exact:true}).fill('合成数据：验证搜索选取和差异确认');
  await modal.getByRole('checkbox').check();await id('confirm-row').click();await modal.waitFor({state:'hidden'});
  await enabled('export-final');
  const final=await download('export-final','synthetic-confirmed.xlsx',3,3);
  assert.deepEqual(final.rows.map(r=>r[final.header.indexOf('物料编码')]),['01.000001','09.000002','01.000001']);
  assert.deepEqual(final.rows.map(r=>r[final.header.indexOf('型号')]),['SYNTHETIC-MODEL-A/0603','SYNTHETIC-ALTERNATIVE','SYNTHETIC-MODEL-A/0603']);
  assert.deepEqual(final.rows.map(r=>r[final.header.indexOf('校对状态')]),['','已人工确认','已人工确认']);
  await page.getByRole('checkbox',{name:'只看需确认项',exact:true}).uncheck();
  await id('review-row-0').click();await modal.waitFor();
  assert.equal(await id('confirm-row').count(),0,'确定项详情不显示确认按钮');
  assert.equal(await modal.locator('[data-testid="review-findings"]').count(),0,'确定项不显示问题警告');
  await modal.getByRole('button',{name:'关闭',exact:true}).click();await modal.waitFor({state:'hidden'});
  await id('review-row-1').click();await modal.waitFor();
  assert.ok((await modal.innerText()).includes('SYNTHETIC-ALTERNATIVE'));
  await modal.getByLabel('最终型号 / 规格',{exact:true}).fill('SYNTHETIC-MODIFIED');
  await modal.getByRole('button',{name:'保存并重新检查',exact:true}).click();
  await modal.getByRole('button',{name:'关闭',exact:true}).click();await modal.waitFor({state:'hidden'});
  assert.equal(await id('export-final').isDisabled(),true);assert.equal(await id('pending-summary').innerText(),'需确认 1');
  report.cases.push({name:'synthetic-confirmation',passed:true,checks:['真实Pyodide','确定项零点击无标注','默认只显示问题','字段原值库值与原因','只确认问题项即可正式导出','搜索候选','编码型号回读','修改撤销确认']});
  console.log('Synthetic real-Pyodide confirmation/download/invalidation passed');
  if(process.env.BOMKIT_PRIVATE_TESTS==='1') {
    for(const [name,count,qty,t] of [
      ['jlc.xlsx',55,171,'template-company.xlsx'],['altium.xlsx',94,250,'template-company-alt.xlsx'],
      ['cadence-report.xlsx',309,1004,'template-simple.xlsx'],['cadence-detail.xlsx',76,76,'template-company.xlsx'],
      ['cadence-grouped.xlsx',33,76,'template-company-alt.xlsx'],['cadence-grouped.txt',33,76,'template-simple.xlsx'],
    ]) {
      await reset();await start(path.join(inputs,name),path.join(inputs,'material.xlsx'),path.join(inputs,t),count,qty);
      assert.ok((await page.locator('main').innerText()).includes('物料库 17371 条可用'));
      await download('export-draft',name.replaceAll('.','-')+'-browser-draft.xlsx',count,qty);
      const autoPassed=Number((await id('automatic-summary').innerText()).match(/\d+/)[0]);
      const pending=Number((await id('pending-summary').innerText()).match(/\d+/)[0]);
      assert.equal(autoPassed+pending,count);
      await page.locator('[data-testid^="review-row-"]').first().click();await modal.waitFor();
      assert.ok((await modal.innerText()).includes('BOM 原始信息'));assert.equal(await id('confirm-row').isDisabled(),true);
      await modal.getByRole('button',{name:'关闭',exact:true}).click();await modal.waitFor({state:'hidden'});
      assert.equal(await id('export-final').isDisabled(),true);
      assert.deepEqual(await page.locator('.ant-alert-error').allTextContents(),[]);
      report.cases.push({name,passed:true,rows:count,quantity:qty,autoPassed,pending,template:t,mode:'draft',businessConfirmation:false});
      console.log(name,'real browser draft roundtrip passed',count,qty);
    }
  }
  await reset();
  await page.locator('#bom-file').setInputFiles({name:'empty.txt',mimeType:'text/plain',buffer:Buffer.from('')});
  await page.getByText('表格为空或超过 100000 行限制',{exact:true}).waitFor();
  assert.equal(await id('start-review').isDisabled(),true);
  await page.locator('#bom-file').setInputFiles({name:'broken.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('broken')});
  await page.getByText('不是有效的 XLSX 文件',{exact:true}).waitFor();
  report.cases.push({name:'invalid-inputs',passed:true});
  const largeRows=[['Designator','Quantity','Name','Device','Footprint','Comment']];
  for(let i=1;i<=5000;i++) largeRows.push(['R'+i,'1','10kΩ','SYNTHETIC-MODEL-A','0603','']);
  await start(fixture('synthetic-5000.xlsx',largeRows),materials,template,5000,5000,0);
  await download('export-draft','synthetic-5000-draft.xlsx',5000,5000);
  const largeFinal=await download('export-final','synthetic-5000-final.xlsx',5000,5000);
  assert.ok(largeFinal.rows.every(r=>r[largeFinal.header.indexOf('校对状态')]===''));
  assert.equal(await page.locator('[data-testid^="review-row-"]').count(),0);
  report.cases.push({name:'large-5000-rows',passed:true,rows:5000,quantity:5000,autoPassed:5000,confirmationClicks:0});
  await page.screenshot({path:path.join(output,'synthetic-5000.png'),fullPage:true});
  // 页面布局检查，不把屏幕截图存在等同于人工视觉验收。
  const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
    buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).length}));
  assert.ok(layout.width<=layout.viewport+2,'页面不得整体横向溢出');
  report.layout=layout;
  assert.deepEqual(errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.uploads,[]);
  assert.ok(runtime.has('pyodide.asm.wasm')&&runtime.has('bomcore-0.1.0-py3-none-any.whl'),'必须是实际引擎而非mock');
  report.runtime=[...runtime];report.passed=true;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('E2E passed; report in ignored private outputs/e2e/report.json');
} catch(error) {
  report.passed=false;report.error=String(error);report.pageErrors=errors;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}
