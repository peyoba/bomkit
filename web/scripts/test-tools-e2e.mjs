#!/usr/bin/env node
/** Same-site independent tools: routing, calculations, isolation and responsive layouts. Synthetic data only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import * as XLSX from 'xlsx';

const baseURL=process.env.BOMKIT_E2E_URL || 'http://127.0.0.1:4173/';
const origin=new URL(baseURL).origin;
const url=hash=>{const u=new URL(baseURL);u.hash=hash;return u.href;};
const output=process.env.BOMKIT_TOOLS_E2E_OUTPUT || path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(),'bomkit-tools-e2e');
await fs.mkdir(output,{recursive:true});
const report={baseURL,cases:[],layouts:[],external:[],uploads:[],errors:[],workers:[],requests:[]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin){report.external.push(u.href);return route.abort();}
  if(!['GET','HEAD'].includes(r.method()))report.uploads.push(r.method()+' '+u.pathname);
  report.requests.push(u.pathname);
  await route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('worker',w=>report.workers.push(w.url()));
const rows=()=>page.locator('.rc-table tbody tr');
const resistance=()=>page.getByRole('heading',{name:'电阻计算器',level:1});
const id=name=>page.locator('[data-testid="'+name+'"]');
async function layout(name,width){
  await page.setViewportSize({width,height:1000});
  const data=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,
    outside:[...document.querySelectorAll('main *,header *')].filter(e=>{
      if(e.closest('.rc-table-scroll'))return false;
      const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&(r.left < -1||r.right > innerWidth+1);
    }).map(e=>({tag:e.tagName,cls:e.className?.baseVal ?? e.className,text:(e.innerText||'').slice(0,45)})),
  }));
  report.layouts.push({name,viewport:width,...data});
  assert.ok(data.width<=width+1,JSON.stringify(data));assert.deepEqual(data.outside,[],JSON.stringify(data));
}
try{
  await page.goto(url(''));
  await page.getByRole('button',{name:'开始转换',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'硬件工程师的日常工具',level:1}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Aistone 工具箱首页',exact:true}).innerText(),'Aistone 工具箱');
  assert.equal(await page.title(),'Aistone 工具箱 · 硬件工程师的日常工具');
  assert.equal(await page.getByText(/各自独立|互不影响|两个独立功能区/).count(),0);
  for(const width of [320,375,414,640,768,960,1280,1440])await layout('home',width);
  await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'打开电阻计算器',exact:true}).click();await resistance().waitFor();
  assert.equal(new URL(page.url()).hash,'#resistance');
  assert.equal(await page.getByRole('navigation',{name:'BOM 功能'}).count(),0);
  assert.equal(await page.locator('input[type=file]').count(),0);
  assert.equal(await rows().count(),0);
  report.cases.push('dual-entry-home-and-independent-calculator');

  for(const [name,singleCount,first] of [['电源反馈分压',1,['1','90000','20000','3.3']],['普通电阻分压',15,['1','1200','300','1']]]){
    const region=page.getByRole('region',{name,exact:true});
    await region.getByRole('button',{name:'无电阻并联组合',exact:true}).click();
    assert.equal(await rows().count(),singleCount);
    assert.deepEqual(await rows().first().locator('td').allTextContents(),first);
    await region.getByRole('button',{name:'有电阻并联组合',exact:true}).click();
    assert.equal(await rows().count(),100);
    assert.ok((await page.getByRole('status').innerText()).includes('仅显示前 100 组'));
    report.cases.push(name+'-single-and-parallel');
  }
  await page.getByLabel('目标阻值',{exact:true}).fill('1000');
  await page.getByLabel('目标阻值',{exact:true}).press('Enter');
  assert.equal(await rows().count(),22);
  assert.equal(await rows().filter({hasText:'2000 ∥ 2000'}).count(),1);
  report.cases.push('target-search-enter-and-exact-match');
  assert.deepEqual(report.workers,[]);
  assert.equal(report.requests.some(p=>/pyodide|sessionStore|ExcelWorkspace|ReviewWorkspace/.test(p)),false,'Resistance must not load BOM modules or Python');
  report.cases.push('calculator-loads-no-bom-or-pyodide');
  for(const width of [320,375,414,768,1280,1440])await layout('calculator-results',width);
  await page.screenshot({path:path.join(output,'resistance-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:900});
  await page.screenshot({path:path.join(output,'resistance-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('目标阻值',{exact:true}).fill('');await page.getByRole('button',{name:'搜索阻值',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(await rows().count(),0);
  await page.getByLabel('目标阻值',{exact:true}).fill('1');await page.getByRole('button',{name:'搜索阻值',exact:true}).click();
  assert.ok((await page.getByRole('status').innerText()).includes('没有符合条件'));
  await page.getByLabel('目标阻值',{exact:true}).fill('1000');await page.getByRole('button',{name:'搜索阻值',exact:true}).click();
  report.cases.push('invalid-empty-no-result-and-recovery');

  await page.getByRole('button',{name:'Aistone 工具箱首页',exact:true}).click();
  await page.getByRole('button',{name:'开始转换',exact:true}).waitFor();
  await page.goBack();await resistance().waitFor();assert.equal(await rows().count(),22);
  await page.goForward();await page.getByRole('button',{name:'开始转换',exact:true}).waitFor();
  await page.goBack();await resistance().waitFor();
  await page.getByRole('link',{name:'跳到主要内容'}).focus();await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash,'#resistance');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'main-content');
  await page.reload();await resistance().waitFor();
  assert.equal(await page.getByLabel('目标阻值',{exact:true}).inputValue(),'');assert.equal(await rows().count(),0);
  assert.equal(await page.title(),'Aistone 工具箱 · 电阻计算器');
  report.cases.push('history-skip-link-and-direct-refresh');

  await page.getByLabel('目标阻值',{exact:true}).fill('1000');await page.getByRole('button',{name:'搜索阻值',exact:true}).click();
  await page.getByRole('button',{name:'BOM 工具',exact:true}).click();await id('excel-convert').waitFor();
  const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Name','Designator','Quantity','Footprint','Device'],['10kΩ','R1','1','0603','10kΩ/0603']]),'合成表');
  await page.locator('#bom-file').setInputFiles({name:'independent-tools.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})});
  await page.getByLabel('PCBA名称',{exact:true}).fill('独立工具隔离验证');
  await page.waitForFunction(()=>!document.querySelector('[data-testid="excel-convert"]')?.disabled,null,{timeout:120000});
  await page.getByRole('button',{name:'电阻计算器',exact:true}).click();await resistance().waitFor();
  assert.equal(await page.getByLabel('目标阻值',{exact:true}).inputValue(),'1000');assert.equal(await rows().count(),22);
  await page.getByLabel('目标阻值',{exact:true}).fill('1500');await page.getByRole('button',{name:'清空结果',exact:true}).click();
  await page.getByRole('button',{name:'BOM 工具',exact:true}).click();await id('excel-convert').waitFor();
  assert.ok((await page.locator('#main-content').innerText()).includes('independent-tools.xlsx'));
  assert.equal(await page.getByLabel('PCBA名称',{exact:true}).inputValue(),'独立工具隔离验证');
  assert.equal(await page.locator('#main-content').count(),1);
  await page.getByRole('button',{name:'网页校对（可选）',exact:true}).click();await id('start-review').waitFor();
  assert.ok((await page.locator('#main-content').innerText()).includes('independent-tools.xlsx'));
  await page.reload();await id('start-review').waitFor();assert.equal(new URL(page.url()).hash,'#bom/review');
  report.cases.push('bom-file-draft-and-calculator-state-isolation');

  // Hold a real file read open so Back/Forward protection is deterministic, rather than racing fast parsing.
  await page.getByRole('button',{name:'Aistone 工具箱首页',exact:true}).click();
  await page.getByRole('button',{name:'打开电阻计算器',exact:true}).click();await resistance().waitFor();
  await page.getByRole('button',{name:'BOM 工具',exact:true}).click();await id('excel-convert').waitFor();
  await page.getByRole('button',{name:'网页校对（可选）',exact:true}).click();await id('start-review').waitFor();
  await page.goBack();await id('excel-convert').waitFor();
  const position=await page.evaluate(()=>history.state.__bomkitRouteIndex);
  await page.evaluate(()=>{
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(){
      if(this.name!=='navigation-guard.xlsx')return original.call(this);
      return new Promise(resolve=>{window.__resumeBomRead=()=>{File.prototype.arrayBuffer=original;resolve(original.call(this));};});
    };
  });
  await page.locator('#bom-file').setInputFiles({name:'navigation-guard.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})});
  await page.waitForFunction(()=>document.querySelector('.e-nav-item')?.disabled&&typeof window.__resumeBomRead==='function');
  for(const move of [()=>page.goBack(),()=>page.goForward()]){
    await move();
    await page.waitForFunction(index=>history.state?.__bomkitRouteIndex===index&&location.hash==='#bom/excel',position);
    assert.equal(await id('excel-convert').isVisible(),true);
  }
  await page.evaluate(()=>{window.__resumeBomRead();delete window.__resumeBomRead;});
  await page.waitForFunction(()=>!document.querySelector('.e-nav-item')?.disabled);
  await page.goBack();await resistance().waitFor();assert.equal(new URL(page.url()).hash,'#resistance');
  await page.goForward();await id('excel-convert').waitFor();assert.equal(new URL(page.url()).hash,'#bom/excel');
  await page.goForward();await id('start-review').waitFor();assert.equal(new URL(page.url()).hash,'#bom/review');
  report.cases.push('busy-back-forward-restores-position-without-overwriting-history');

  assert.deepEqual(report.external,[]);assert.deepEqual(report.uploads,[]);assert.deepEqual(report.errors,[]);
  report.passed=true;console.log('Independent tools passed:',report.cases.length,'flows,',report.layouts.length,'layout checks');
}catch(error){report.passed=false;report.error=String(error);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log('Tools report:',path.join(output,'report.json'));}
