import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { cartesianNavigator } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";
import { sessionFixture } from "../chart-application/applicationSessionFixture";
import { projectArea } from "../../../src/components/General/Table/Chart/echarts/cartesianArea";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (v: string) => ({width:v.length*6}) } as any));
const columns = ["First", "Second", "Third"].map(id => ({id,label:id,role:"number" as const}));
const snapshot = {...validSnapshotInput, columns, selectedColumnIds: columns.map(c=>c.id), rows: [[7,-6,5],[-2,5,-3],[null,2,4],[3,null,-2]].map((values,i)=>({id:String(i),category:`Row${i}`, values:Object.fromEntries(columns.map((c,j)=>[c.id,values[j]]))}))};
function mapped(family: string, selection?: Record<string,boolean>) {
 const style = applicationStyle(); style.application.series.labels.enabled=true;
 const result=translateCartesian(snapshot,family,style,{...mappingContext(),legendSelection:selection});
 expect(result.status).toBe("supported"); if(result.status!=="supported") throw Error(JSON.stringify(result));
 return {options:result.options as any,style};
}
it.each(["area","stackedArea","normalizedArea"] as const)("renders %s projected bands in native SVG", family=>{
 const {options,style}=mapped(family);
 const projection=projectArea({snapshot,columns,family,connectMissingData:style.application.series.connectMissingData});
 expect(options.legend.data.map((v:any)=>v.name)).toEqual(columns.map(c=>c.id));
 expect(options.legend.data.every((v:any)=>v.icon.includes("L1 1"))).toBe(true);
 const chart=init(null,undefined,{renderer:"svg",ssr:true,width:800,height:500});
 try {
 chart.setOption({...options,animation:false});
 const model=(chart as any).getModel();
 projection.series.forEach(item=>{
  const publicSeries=options.series.find((s:any)=>s.id===item.id);
  expect(publicSeries.data.map((p:any)=>p[1])).toEqual(item.markers);
  const expected=item.fills.flat();
  const actual: {rowIndex:number; lower:number; upper:number}[]=[];
  model.getSeries().filter((s:any)=>s.id.startsWith(`openbb-area-fill-${encodeURIComponent(item.id)}-`)).forEach((native:any)=>{
   const data=native.getData();const dim=data.getCalculationInfo("stackResultDimension");
   const pixels=Array.from(data.getLayout("points")) as number[];
   const shape=(chart as any).getViewOfSeriesModel(native)._polygon.shape;
   for(let j=0;j<data.count();j++){
    const raw=native.option.data[j];const upper=data.get(dim,j);const lower=upper-raw[0];
    const point={rowIndex:raw[1],lower,upper};actual.push(point);
    expect(expected.some(p=>p.rowIndex===point.rowIndex&&Math.abs(p.upper-upper)<1e-9&&Math.abs(p.lower-lower)<1e-9)).toBe(true);
    const target=chart.convertToPixel({seriesIndex:native.seriesIndex},[point.rowIndex,upper]) as number[];
    const bottom=chart.convertToPixel({seriesIndex:native.seriesIndex},[point.rowIndex,lower]) as number[];
    expect(shape.stackedOnPoints[j*2]).toBeCloseTo(bottom[0],3);expect(shape.stackedOnPoints[j*2+1]).toBeCloseTo(bottom[1],3);
    expect(pixels[j*2]).toBeCloseTo(target[0],3);expect(pixels[j*2+1]).toBeCloseTo(target[1],3);
   }
  });
  expected.forEach(p=>expect(actual.some(q=>q.rowIndex===p.rowIndex&&Math.abs(q.upper-p.upper)<1e-9&&Math.abs(q.lower-p.lower)<1e-9)).toBe(true));
 });
 expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
 }finally{chart.dispose();}
});
it("keeps processed labels separate from raw tooltip and ignores internal row indexes",()=>{
 const {options}=mapped("normalizedArea");
 const series=options.series.find((s:any)=>s.id==="First");
 expect(series.label.formatter({dataIndex:2})).toBe("label:0");
 const tooltip=options.tooltip.formatter([{seriesId:"openbb-area-fill-First-0",dataIndex:0},{seriesId:"First",dataIndex:2}]);
 expect(tooltip).toContain("Row2");expect(tooltip).toContain("First: —");
 expect(snapshot.rows[2].values.First).toBeNull();
});
it("reprojects legend membership",()=>{
 const full=mapped("stackedArea").options; const hidden=mapped("stackedArea",{Second:false}).options;
 expect(full.series.find((s:any)=>s.id==="Third").data[0][1]).toBe(6);
 expect(hidden.series.find((s:any)=>s.id==="Third").data[0][1]).toBe(12);
 expect(hidden.series.filter((s:any)=>s.id.startsWith("openbb-area-fill-Second-"))).toEqual([]);
});

it.each(["area", "stackedArea", "normalizedArea"])("keeps %s miniature independent with invisible baseline and marker carriers",family=>{
 const full=mapped(family).options;const main=mapped(family,{Second:false}).options;
 const options=cartesianNavigator(main,true,true,sessionFixture({}).inputs.theme,{width:800},full) as any;
 const mini=options.series.slice(main.series.length);
 expect(mini.map((s:any)=>s.data)).toEqual(full.series.map((s:any)=>s.data));
 expect(mini.filter((s:any)=>s.id.includes("openbb-area-base-")).every((s:any)=>s.lineStyle.width===0&&s.lineStyle.opacity===0&&s.areaStyle.opacity===0)).toBe(true);
 expect(mini.find((s:any)=>s.id==="openbb-mini-First").lineStyle.width).toBe(0);
 expect(mini.every((s:any)=>s.label.show===false&&s.tooltip.show===false&&s.silent)).toBe(true);
 expect(options.dataZoom[0].xAxisIndex).toEqual([0]);
 const chart=init(null,undefined,{renderer:"svg",ssr:true,width:800,height:500});
 try{chart.setOption({...options,animation:false});expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);}finally{chart.dispose();}
});

it("coalesces continuous geometry into bounded native series",()=>{
 const rows=Array.from({length:1000},(_,i)=>({id:String(i),category:String(i),values:{First:i%2?7:-2,Second:i%2?-6:5,Third:5}}));
 const result=translateCartesian({...snapshot,rows},"stackedArea",applicationStyle(),mappingContext());
 expect(result.status).toBe("supported");if(result.status!=="supported")return;
 expect((result.options.series as any[]).length).toBe(12);
});

it.each(["number", "time"] as const)("keeps explicit Y-first stacks on continuous %s categories",type=>{
 const style=applicationStyle();style.application.axes.category.fields.type=type;style.application.series.connectMissingData=false;
 const rows=snapshot.rows.slice(0,2).map((r,i)=>({...r,category:type==="number"?i*10:`2026-10-${18+i}`}));
 const result=translateCartesian({...snapshot,rows},"stackedArea",style,mappingContext());
 expect(result.status).toBe("supported");if(result.status!=="supported")return;
 const options=result.options as any;
 const chart=init(null,undefined,{renderer:"svg",ssr:true,width:800,height:500});
 try{
 chart.setOption({...options,animation:false});
 const model=(chart as any).getModel();const fill=model.getSeries().find((s:any)=>s.id==="openbb-area-fill-Third-0");
 const data=fill.getData();
 expect(data.getCalculationInfo("stackedDimension")).toBe("y");
 expect(fill.option.dimensions).toEqual(["y","x"]);
 const shape=(chart as any).getViewOfSeriesModel(fill)._polygon.shape;
 [6,0].forEach((upper,i)=>{
  expect(data.get(data.getCalculationInfo("stackResultDimension"),i)).toBe(upper);
  const lower=[1,3][i];
  const x=type==="number"?i*10:new Date(rows[i].category).getTime();
  const pixel=chart.convertToPixel({seriesIndex:fill.seriesIndex},[x,upper]) as number[];
  const bottom=chart.convertToPixel({seriesIndex:fill.seriesIndex},[x,lower]) as number[];
  const actual=data.getLayout("points");expect(actual[i*2]).toBeCloseTo(pixel[0],3);expect(actual[i*2+1]).toBeCloseTo(pixel[1],3);
  expect(shape.stackedOnPoints[i*2]).toBeCloseTo(bottom[0],3);expect(shape.stackedOnPoints[i*2+1]).toBeCloseTo(bottom[1],3);
 });
 }finally{chart.dispose();}
});
it("preserves gap strokes, full style controls and percent axis precedence",()=>{
 const style=applicationStyle();style.application.series.connectMissingData=false;
 style.series.First={fill:"#ff0000",stroke:"#00ff00",strokeWidth:7,markerFill:"#123456",markerStroke:"#654321",markerStrokeWidth:4};
 const result=translateCartesian(snapshot,"normalizedArea",style,mappingContext());
 expect(result.status).toBe("supported");if(result.status!=="supported")return;
 const options=result.options as any;const publicSeries=options.series.find((s:any)=>s.id==="First");
 const stroke=options.series.find((s:any)=>s.id.startsWith("openbb-area-stroke-First-"));
 const fill=options.series.find((s:any)=>s.id.startsWith("openbb-area-fill-First-"));
 expect(stroke.lineStyle).toMatchObject({color:"#00ff00",width:7,opacity:0.4,type:[5,2]});
 expect(fill.areaStyle).toMatchObject({color:"#ff0000",opacity:0.6,shadowBlur:4,shadowOffsetX:-2,shadowOffsetY:3});
 expect(publicSeries.itemStyle.borderWidth).toBe(4);expect(publicSeries.symbolSize).toBe(9);expect(publicSeries.z).toBeGreaterThan(stroke.z);
 expect(options.yAxis.axisLabel.formatter(37.6)).toBe("38%");expect(options.yAxis.axisPointer.label.formatter({value:37.6})).toBe("cross:37.6");
 const gap=translateCartesian(snapshot,"stackedArea",style,mappingContext());if(gap.status!=="supported")throw Error("gap");
 const gapSeries=gap.options.series as any[];
 expect(gapSeries.filter(s=>s.id.startsWith("openbb-area-stroke-First-")).map(s=>s.data)).toEqual([[[7,0],[-2,1]]]);
});
it("keeps column IDs sharing internal prefixes public and collision free",()=>{
 const id="openbb-area-fill-First-0";const cols=[columns[0],{id,label:id,role:"number" as const}];
 const rows=snapshot.rows.map(r=>({...r,values:{First:r.values.First,[id]:2}}));
 const result=translateCartesian({...snapshot,columns:cols,selectedColumnIds:cols.map(c=>c.id),rows},"area",applicationStyle(),mappingContext());
 expect(result.status).toBe("supported");if(result.status!=="supported")return;
 const options=result.options as any;const ids=options.series.map((s:any)=>s.id);
 expect(new Set(ids).size).toBe(ids.length);expect(options.series.find((s:any)=>s.id===id).silent).not.toBe(true);
 expect(options.tooltip.formatter([{seriesId:id,dataIndex:0}])).toContain(`${id}: number:2`);
});
it("retains the original miniature stroke for a line with a hidden main stroke",()=>{
 const style=applicationStyle();style.application.series.strokeWidth=0;
 const result=translateCartesian(snapshot,"line",style,mappingContext());
 expect(result.status).toBe("supported");if(result.status!=="supported")return;
 const main=result.options as any;
 expect(main.series[0].lineStyle.width).toBe(0);
 const options=cartesianNavigator(main,true,true,sessionFixture({}).inputs.theme,{width:800}) as any;
 expect(options.series.slice(main.series.length).every((s:any)=>s.lineStyle.width===2)).toBe(true);
});