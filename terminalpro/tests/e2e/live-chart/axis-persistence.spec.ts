import { test, expect, loginDisposableWorkspace } from './fixtures';
import { importOrdinaryTable } from './journey';
import { expand, openEditor, saveDashboard, selectFamily } from './editor';
import { reopenSavedDashboard } from './persistence';
import { drawnText, expectApplicationDiagnostics } from './diagnostics';

async function pointSpacing(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const anchors = (window as typeof window & {
      chartDrawnAnchors: Record<string, {x: number; y: number}>;
    }).chartDrawnAnchors;
    const xs = ['11', '22', '33'].map(label => anchors[label]?.x);
    return xs.every(Number.isFinite) ? (xs[1] - xs[0]) / (xs[2] - xs[1]) : NaN;
  });
}

test('date axis type and format survive saved dashboard reopening', async ({page,browser},info) => {
  await loginDisposableWorkspace(page);
  const {widget,dashboardUrl}=await importOrdinaryTable(page,{
    name:'Saved date-axis observations',expectedValue:'33',
    csv:'Date,Price\n2026-01-01,11\n2026-01-08,22\n2026-02-01,33\n2026-03-01,27\n',
  });
  await widget.locator('#chart-view-button').click();
  let editor=await openEditor(page,widget);
  await selectFamily(editor,'Line');
  await editor.getByRole('tab',{name:'Customize',exact:true}).click();
  await expand(editor,'Series');
  const labels = editor.getByRole('region',{name:'Series',exact:true})
    .getByRole('group',{name:'Labels',exact:true})
    .getByRole('switch',{name:'Labels',exact:true});
  if ((await labels.getAttribute('aria-checked')) !== 'true') await labels.click();
  await expand(editor,'Horizontal Axis');
  await editor.getByRole('combobox',{name:'Axis Type',exact:true}).selectOption({label:'Time'});
  await editor.getByRole('combobox',{name:'Time Format',exact:true}).selectOption({label:'DD/MM/YY'});
  await editor.getByRole('button',{name:'Collapse chart editor',exact:true}).click();
  const payload=await saveDashboard(page);
  const id=new URL(dashboardUrl).pathname.split('/').at(-1)!;
  expect(payload.items[id].data.widgets[0].storage.default.chartModel.qopenbbAxisSettings)
    .toEqual({version:1,categoryType:'time',timeFormat:'%d/%m/%y'});
  await page.close();
  const reopened=await reopenSavedDashboard(browser,dashboardUrl);
  try {
    editor=await openEditor(reopened.page,reopened.widget);
    await editor.getByRole('tab',{name:'Customize',exact:true}).click();
    await expand(editor,'Horizontal Axis');
    await expect(editor.getByRole('combobox',{name:'Axis Type',exact:true})).toHaveValue('time');
    await expect(editor.getByRole('combobox',{name:'Time Format',exact:true})).toHaveValue('%d/%m/%y');
    await editor.getByRole('button',{name:'Collapse chart editor',exact:true}).click();
    await expect.poll(async()=> (await drawnText(reopened.page)).some(text=>/^\d{2}\/\d{2}\/26$/.test(text))).toBe(true);
    // Consecutive observations are seven and twenty-four days apart, not equal categories.
    await expect.poll(() => pointSpacing(reopened.page)).toBeCloseTo(7 / 24, 2);
    await reopened.page.waitForTimeout(2500);
    await reopened.widget.screenshot({path:info.outputPath('saved-date-axis.png'),animations:'allow'});
    editor=await openEditor(reopened.page,reopened.widget);
    await editor.getByRole('tab',{name:'Customize',exact:true}).click();
    await expand(editor,'Horizontal Axis');
    await editor.getByRole('combobox',{name:'Axis Type',exact:true}).selectOption({label:'Category'});
    await saveDashboard(reopened.page);
    expectApplicationDiagnostics(reopened.diagnostics);
  } finally { await reopened.context.close(); }
  const category=await reopenSavedDashboard(browser,dashboardUrl);
  try {
    await expect.poll(() => pointSpacing(category.page)).toBeCloseTo(1, 2);
    editor=await openEditor(category.page,category.widget);
    await editor.getByRole('tab',{name:'Customize',exact:true}).click();
    await expand(editor,'Horizontal Axis');
    await expect(editor.getByRole('combobox',{name:'Axis Type',exact:true})).toHaveValue('category');
    await expect(editor.getByRole('combobox',{name:'Time Format',exact:true})).toHaveCount(0);
    expectApplicationDiagnostics(category.diagnostics);
  } finally { await category.context.close(); }
});
