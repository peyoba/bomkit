#!/usr/bin/env node
/** A浅色方案：真实输入/清除/键盘与响应式检查；不改变业务契约，不上传资料。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import * as XLSX from 'xlsx';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'core/tests/fixtures/private/ui-a-validation');
await fs.mkdir(output,{recursive:true});
const baseURL=process.env.BOMKIT_E2E_URL || 'http://127.0.0.1:4173/';
const origin=new URL(baseURL).origin;
const report={baseURL,style:'A only / light',cases:[],layouts:[],external:[],uploads:[],errors:[]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin){report.external.push(u.origin+u.pathname);return route.abort();}
  if(!['GET','HEAD'].includes(r.method()))report.uploads.push(r.method()+' '+u.pathname);
  await route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
const id=name=>page.locator('[data-testid="'+name+'"]');
const headers=['Name','Designator','Quantity','Footprint','Device'];
function workbook(name,sheets){
  const w=XLSX.utils.book_new();for(const [title,rows] of sheets)XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),title);
  return {name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})};
}
async function ready(){await page.waitForFunction(()=>{const b=document.querySelector('[data-testid="excel-convert"]');return b&&!b.disabled;},null,{timeout:120000});}
async function layout(name,width){
  await page.setViewportSize({width,height:960});
  const data=await page.evaluate(()=>{
    const outside=[...document.querySelectorAll('main *,header *')].filter(e=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&(r.left < -1||r.right > innerWidth+1);
    }).map(e=>({tag:e.tagName,cls:e.className?.baseVal ?? e.className,text:(e.innerText||'').slice(0,45)}));
    const wraps=[...document.querySelectorAll('header button,.a-primary')].filter(e=>{
      const r=document.createRange();r.selectNodeContents(e);return new Set([...r.getClientRects()].filter(r=>r.width>1).map(r=>Math.round(r.top/10))).size>2;
    }).map(e=>e.textContent);
    const tiny=[...document.querySelectorAll('main input:not([type="checkbox"]):not([type="file"]),main select,button')].filter(e=>e.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.getAttribute('aria-label')||e.textContent);
    return {viewport:innerWidth,width:document.documentElement.scrollWidth,outside,wraps,tiny};
  });
  report.layouts.push({name,...data});
  assert.ok(data.width<=width+1,JSON.stringify(data));assert.deepEqual(data.outside,[],JSON.stringify(data));assert.deepEqual(data.tiny,[]);
}
try{
  await page.goto(baseURL);
  for(const width of [320,375,414,768,1280,1440])await layout('home',width);
  await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'开始转换',exact:true}).click();await id('excel-convert').waitFor();
  assert.equal(await id('excel-convert').isDisabled(),true);
  assert.equal(await page.locator('.a-file-name').filter({hasText:'示例BOM.xlsx'}).count(),0);
  await page.waitForFunction(()=>!document.querySelector('[data-testid="engine-status"]'),null,{timeout:120000});
  await page.screenshot({path:path.join(output,'empty-desktop.png'),fullPage:true});
  for(const width of [320,375,414,768,1280,1440])await layout('empty-workspace',width);
  assert.equal(await page.getByRole('switch').count(),0);
  report.cases.push({name:'A-only-empty-layout-and-navigation',passed:true});

  const bom=workbook('示例BOM.xlsx',[
    ['第一页',[headers,['10kΩ','R1','1','0603','10kΩ/0603']]],
    ['第二页',[headers,['100nF','C1,C2','2','0603','100nF/0603']]],
  ]);
  const mats=workbook('示例物料表.xlsx',[['物料', [['编码','名称','规格型号'],['001','电阻','10kΩ/0603'],['002','电容','100nF/0603']]]]);
  await page.locator('#bom-file').setInputFiles(bom);await page.locator('#material-file').setInputFiles(mats);await ready();
  assert.equal(await page.getByRole('combobox',{name:'BOM 文件工作表'}).count(),1);
  await page.getByRole('combobox',{name:'BOM 文件工作表'}).click();
  await page.locator('.ant-select-item-option').filter({hasText:'第二页'}).click();await ready();
  await page.getByRole('button',{name:'清除物料库文件',exact:true}).click();await ready();
  assert.equal(await page.locator('#material-file').inputValue(),'');
  report.cases.push({name:'sheet-switch-and-optional-material-clear',passed:true});

  for(const [name,value] of [['PCBA名称','示例控制板'],['PCBA型号','DEMO-PCBA-01'],['PCB空板名称','示例空板'],['PCB空板型号','DEMO-PCB-01']])await page.getByLabel(name,{exact:true}).fill(value);
  await page.getByLabel('输出文件名',{exact:true}).fill('我的转换结果');
  await page.getByLabel('PCBA名称',{exact:true}).focus();
  assert.equal(await page.getByLabel('PCBA名称',{exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
  await page.getByLabel('PCBA名称',{exact:true}).blur();
  await page.screenshot({path:path.join(output,'loaded-desktop.png'),fullPage:true});
  for(const width of [320,375,414,768,1280,1440])await layout('loaded-workspace',width);
  await page.setViewportSize({width:375,height:900});await page.screenshot({path:path.join(output,'loaded-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:960});
  const p=page.waitForEvent('download',{timeout:120000});await id('excel-convert').click();const d=await p;
  assert.equal(d.suggestedFilename(),'我的转换结果.xlsx');
  const destination=path.join(output,'synthetic-sheet2.xlsx');await d.saveAs(destination);assert.equal(await d.failure(),null);
  const result=XLSX.read(await fs.readFile(destination),{type:'buffer'});const sheet=result.Sheets[result.SheetNames[0]];
  assert.equal(sheet.D2.v,'示例控制板');assert.equal(sheet.C4.v,'示例空板');assert.equal(sheet.E5.v,'C1,C2');assert.equal(sheet.F5.v,2);
  assert.equal(result.SheetNames.length,3);await id('excel-result').waitFor();
  report.cases.push({name:'real-engine-download-and-fields-preserved',passed:true});
  await page.screenshot({path:path.join(output,'result-desktop.png'),fullPage:true});
  for(const width of [320,375,414,768,1440])await layout('result',width);

  await page.locator('#bom-file').setInputFiles({name:'bad.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('broken')});
  await page.getByText('不是有效的 XLSX 文件',{exact:true}).waitFor();
  assert.equal(await page.locator('#bom-file').getAttribute('aria-invalid'),'true');assert.equal(await id('excel-convert').isDisabled(),true);
  await page.screenshot({path:path.join(output,'error-desktop.png'),fullPage:true});
  report.cases.push({name:'inline-file-error-no-unsafe-download',passed:true});
  await page.getByRole('button',{name:'网页校对（可选）',exact:true}).click();await id('start-review').waitFor();
  await page.getByRole('button',{name:'bomkit 首页',exact:true}).click();await page.getByRole('button',{name:'开始转换',exact:true}).waitFor();
  report.cases.push({name:'optional-review-and-home-retained',passed:true});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.uploads,[]);
  report.passed=true;console.log('A UI passed:',report.cases.length,'flows,',report.layouts.length,'layout checks');
}catch(error){report.passed=false;report.error=String(error);throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
